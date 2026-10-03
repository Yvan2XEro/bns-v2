import type { Payload, PayloadRequest } from "payload";
import { isModerator } from "../access/roles";
import { can, resolveShopRole, type ShopRole } from "../access/shopRoles";
import {
	assertNotSuspended,
	type SuspensionCheckable,
} from "../hooks/suspensionGuard";
import { ERROR_CODES } from "../lib/errors";
import {
	getPaymentSettings,
	isProtectedPaymentFlagOpen,
	isProtectedPaymentOpen,
	type MarketRow,
	type PaymentSettings,
	resolveSettlement,
} from "../lib/paymentSettings";
import {
	type AccountEvent,
	type ConnectedAccountStatus,
	type MarketplaceProvider,
	type NormalisedAccount,
	type PayoutSchedule,
	ProviderUnavailableError,
} from "../lib/payments/marketplace";
import { getMarketplaceProvider } from "../lib/payments/marketplaceRegistry";
import {
	PAYOUT_HOLD_CATEGORIES,
	type PayoutHoldCategory,
} from "../lib/payoutHoldCategories";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import { commitContextOf, onCommit } from "../lib/transactions";
import type {
	ConnectedAccount,
	PayoutAccount,
	PayoutHold,
	Shop,
	User,
} from "../payload-types";
import {
	notifyConnectedAccountLost,
	notifyPaymentsOnboardingAction,
} from "./paymentNotifications";
import { PAYOUT_CHANGE_COOLDOWN_DAYS } from "./payoutAccounts";
import { createHold } from "./payoutHolds";
import type { ServiceUser } from "./shops";

/** Local API calls accept a partial request; routes only have `payload`. */
export type ServiceReq = Partial<PayloadRequest> & { payload: Payload };

export type OnboardingPlatform = "web" | "mobile";

export interface ProviderDeps {
	provider?: MarketplaceProvider;
	settings?: PaymentSettings;
}

export interface PaymentSetupView {
	flagEnabled: boolean;
	eligible: boolean;
	ineligibleReason: null | "level" | "shopStatus" | "market";
	connectedAccount: null | {
		status: ConnectedAccount["status"];
		chargesEnabled: boolean;
		payoutsEnabled: boolean;
		requirementsDue: string[];
		lastSyncedAt: string | null;
	};
	payoutAccount: null | {
		method: PayoutAccount["method"];
		accountName: string;
		accountNumberMasked: string;
		status: PayoutAccount["status"];
		activatedAt: string | null;
	};
	pendingAccount: null | {
		method: string;
		accountNumberMasked: string;
		status: string;
	};
	holds: Array<{
		scope: "shop" | "order";
		reasonCategory: PayoutHoldCategory;
		until: string | null;
	}>;
	changeCooldownUntil: string | null;
	/** `payments.payoutAccountChangeHoldHours`, the same source the hold
	 * enforcer (`payoutAccounts.ts`) and the SMS (`paymentNotifications.ts`)
	 * read — never a client-side literal. */
	payoutChangeHoldHours: number;
}

const LOST_STATUSES: readonly ConnectedAccountStatus[] = [
	"disabled",
	"deauthorized",
];

/** The view shows the cooldown `createPayoutAccount` enforces: one number. */
const PAYOUT_ACCOUNT_CHANGE_COOLDOWN_MS =
	PAYOUT_CHANGE_COOLDOWN_DAYS * 86_400_000;

const webUrl = () => process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com";

/** The shop's market: its own country when set, else the launch market. */
export function shopMarketCountry(
	shop: Pick<Shop, "location">,
	settings: PaymentSettings,
): string {
	const own = shop.location?.countryCode?.trim().toUpperCase();
	return own || settings.markets[0]?.countryCode || "";
}

/** The shop's `provider_split` market row, enabled or not; null when none resolves. */
export function marketOf(
	settings: PaymentSettings,
	shop: Pick<Shop, "location">,
): MarketRow | null {
	try {
		return resolveSettlement(settings, shopMarketCountry(shop, settings));
	} catch {
		return null;
	}
}

function scheduleFor(settings: PaymentSettings): PayoutSchedule {
	return settings.releaseModel === "provider_hold" ? "manual" : "weekly";
}

async function callProvider<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof ProviderUnavailableError) {
			throw new ServiceError(ERROR_CODES.paymentProviderUnavailable, 503);
		}
		throw error;
	}
}

async function resolveDeps(
	payload: Payload,
	deps: ProviderDeps,
): Promise<{ provider: MarketplaceProvider; settings: PaymentSettings }> {
	const settings = deps.settings ?? (await getPaymentSettings(payload));
	return {
		settings,
		provider: deps.provider ?? getMarketplaceProvider(settings),
	};
}

export async function findConnectedAccount(
	payload: Payload,
	shopId: string,
	req?: ServiceReq,
): Promise<ConnectedAccount | null> {
	const { docs } = await payload.find({
		collection: "connected-accounts",
		where: { shop: { equals: shopId } },
		sort: "createdAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs[0] ?? null;
}

async function ownerContact(
	payload: Payload,
	shop: Shop,
): Promise<{ email: string; phone: string }> {
	const ownerId = relationId(shop.owner);
	const owner = ownerId
		? ((await payload
				.findByID({
					collection: "users",
					id: ownerId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)) as User | null)
		: null;
	// Level 1 is the owner's verified phone; a level-2 shop without one is
	// a data fault, not something to hand the provider blank.
	if (!owner?.email || !owner.phone || !owner.phoneVerifiedAt) {
		throw new ServiceError(ERROR_CODES.paymentShopNotEligible, 403);
	}
	return { email: owner.email, phone: owner.phone };
}

/**
 * The shop's connected account, created at the provider when it has none.
 * The local row is claimed first, so the `(shop, provider)` unique index
 * settles concurrent first calls before anything reaches the provider; a row
 * left without `providerAccountId` by a crash is completed on the next call.
 */
export async function ensureConnectedAccount(
	req: ServiceReq,
	shop: Shop,
	deps: ProviderDeps = {},
): Promise<ConnectedAccount> {
	const { payload } = req;
	const { provider, settings } = await resolveDeps(payload, deps);
	const market = marketOf(settings, shop);
	if (!market)
		throw new ServiceError(ERROR_CODES.paymentMarketUnavailable, 400);
	const shopId = String(shop.id);

	let row = await findConnectedAccount(payload, shopId, req);
	if (!row) {
		try {
			row = await payload.create({
				collection: "connected-accounts",
				data: {
					shop: shopId,
					provider: market.provider,
					accountType: "express",
					status: "created",
				},
				depth: 0,
				overrideAccess: true,
				req,
			});
		} catch (error) {
			row = await findConnectedAccount(payload, shopId, req);
			if (!row) throw error;
		}
	}

	if (!row.providerAccountId) {
		const contact = await ownerContact(payload, shop);
		const { accountId } = await callProvider(() =>
			provider.createConnectedAccount({
				shopId,
				name: shop.name,
				email: contact.email,
				phone: contact.phone,
				type: "express",
			}),
		);
		row = await payload.update({
			collection: "connected-accounts",
			id: row.id,
			data: { providerAccountId: accountId },
			depth: 0,
			overrideAccess: true,
			req,
		});
	}

	const schedule = scheduleFor(settings);
	const accountId = row.providerAccountId;
	if (accountId && row.payoutSchedule !== schedule) {
		await callProvider(() => provider.setPayoutSchedule(accountId, schedule));
		row = await payload.update({
			collection: "connected-accounts",
			id: row.id,
			data: { payoutSchedule: schedule },
			depth: 0,
			overrideAccess: true,
			req,
		});
	}
	return row;
}

export function onboardingUrls(platform: OnboardingPlatform): {
	returnUrl: string;
	refreshUrl: string;
} {
	if (platform === "mobile") {
		const url = "buynsellem://seller/payments/setup";
		return { returnUrl: url, refreshUrl: url };
	}
	const setup = `${webUrl()}/seller/payments/setup`;
	return { returnUrl: `${setup}?onboarding=done`, refreshUrl: setup };
}

/** A new hosted-onboarding link on every call; links expire, so none is stored. */
export async function freshOnboardingLink(
	payload: Payload,
	shop: Shop,
	options: ProviderDeps & { platform?: OnboardingPlatform } = {},
): Promise<{ url: string }> {
	const row = await findConnectedAccount(payload, String(shop.id));
	const accountId = row?.providerAccountId;
	if (!accountId) {
		throw new ServiceError(ERROR_CODES.payoutOnboardingIncomplete, 409);
	}
	const { provider } = await resolveDeps(payload, options);
	return callProvider(() =>
		provider.createOnboardingLink(
			accountId,
			onboardingUrls(options.platform ?? "web"),
		),
	);
}

/**
 * The payments screens' gate: owner and manager through `payments.view`, and
 * staff. A member without the permission gets the permission error; anyone
 * else — including a member of another shop — learns nothing about this one.
 */
export async function requirePaymentsViewer(
	payload: Payload,
	user: ServiceUser,
	shop: Shop,
): Promise<void> {
	const role = await roleOrNotFound(payload, user, shop);
	if (role && !can(role, "payments.view")) {
		throw new ServiceError(ERROR_CODES.shopForbidden, 403);
	}
}

/** What a shop sees of its holds: the category, never the reason. */
export function holdsView(
	holds: readonly PayoutHold[],
): PaymentSetupView["holds"] {
	return holds.map((hold) => ({
		scope: hold.scope,
		reasonCategory: PAYOUT_HOLD_CATEGORIES[hold.reason],
		until: hold.until ?? null,
	}));
}

async function roleOrNotFound(
	payload: Payload,
	user: ServiceUser,
	shop: Shop,
): Promise<ShopRole | null> {
	const role = await resolveShopRole(payload, user.id, String(shop.id));
	if (!role && !isModerator(user)) {
		throw new ServiceError(ERROR_CODES.shopNotFound, 404);
	}
	return role;
}

/**
 * `POST /api/shops/{id}/payments/onboarding`. The three eligibility refusals
 * run in the spec's order: the feature, then the market, then the shop.
 */
export async function startOnboarding(
	payload: Payload,
	user: ServiceUser,
	shop: Shop,
	options: ProviderDeps & { platform?: OnboardingPlatform } = {},
): Promise<{ url: string }> {
	const role = await roleOrNotFound(payload, user, shop);
	if (!can(role, "payments.manage")) {
		throw new ServiceError(ERROR_CODES.payoutOwnerOnly, 403);
	}
	await assertNotSuspended(payload, user.id, user as SuspensionCheckable);

	const settings = options.settings ?? (await getPaymentSettings(payload));
	if (!isProtectedPaymentFlagOpen(settings)) {
		throw new ServiceError(ERROR_CODES.paymentProtectedDisabled, 403);
	}
	if (!marketOf(settings, shop)?.enabled) {
		throw new ServiceError(ERROR_CODES.paymentMarketUnavailable, 400);
	}
	if (!shopCapabilities(shop).protectedPayment) {
		throw new ServiceError(ERROR_CODES.paymentShopNotEligible, 403);
	}

	const deps = { ...options, settings };
	await ensureConnectedAccount({ payload }, shop, deps);
	return freshOnboardingLink(payload, shop, deps);
}

function requirementsOf(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

/**
 * Writes provider truth onto the row. Losing the account (disabled or
 * deauthorized) blocks charges with a shop hold, and the owner and staff are
 * told once — on the transition, not on every replay of it. Entering
 * `restricted`, or `active` with requirements due, tells the owner the same way.
 */
async function applyAccountState(
	req: PayloadRequest,
	row: ConnectedAccount,
	state: Pick<NormalisedAccount, "status"> &
		Partial<
			Pick<
				NormalisedAccount,
				| "chargesEnabled"
				| "payoutsEnabled"
				| "requirementsDue"
				| "kycStatus"
				| "kycName"
			>
		>,
	now: Date,
): Promise<ConnectedAccount> {
	const lost = LOST_STATUSES.includes(state.status);
	const updated = await req.payload.update({
		collection: "connected-accounts",
		id: row.id,
		data: {
			status: state.status,
			chargesEnabled: lost
				? false
				: (state.chargesEnabled ?? row.chargesEnabled),
			payoutsEnabled: lost
				? false
				: (state.payoutsEnabled ?? row.payoutsEnabled),
			...(state.requirementsDue
				? { requirementsDue: state.requirementsDue }
				: {}),
			...(state.kycStatus !== undefined ? { kycStatus: state.kycStatus } : {}),
			...(state.kycName !== undefined ? { kycName: state.kycName } : {}),
			lastSyncedAt: now.toISOString(),
		},
		depth: 0,
		overrideAccess: true,
		req,
	});

	if (lost) {
		const shopId = relationId(row.shop) ?? "";
		await createHold(req, {
			scope: "shop",
			shop: shopId,
			reason: "fraud_signal",
			blocksCharges: true,
			createdByType: "system",
		});
		if (!LOST_STATUSES.includes(row.status)) {
			const notify = () =>
				notifyConnectedAccountLost(req.payload, {
					shopId,
					status: state.status,
				});
			if (!onCommit(commitContextOf(req), notify)) await notify();
		}
		return updated;
	}

	const requirementsDue =
		state.requirementsDue ?? requirementsOf(row.requirementsDue);
	if (
		needsOwnerAction(state.status, requirementsDue) &&
		!needsOwnerAction(row.status, requirementsOf(row.requirementsDue))
	) {
		const notify = () =>
			notifyPaymentsOnboardingAction(req.payload, {
				shopId: relationId(row.shop) ?? "",
				status: state.status,
				requirementsDue,
			});
		if (!onCommit(commitContextOf(req), notify)) await notify();
	}
	return updated;
}

/**
 * `payments-onboarding-action`'s condition; the owner is told on entering it.
 * Requirements count only once onboarding is over: before that they are the
 * onboarding itself, which the owner is already in the middle of.
 */
function needsOwnerAction(status: string, requirementsDue: string[]): boolean {
	if (status === "restricted") return true;
	return status === "active" && requirementsDue.length > 0;
}

async function rowForProviderAccount(
	req: PayloadRequest,
	accountId: string,
): Promise<ConnectedAccount | null> {
	const { docs } = await req.payload.find({
		collection: "connected-accounts",
		where: { providerAccountId: { equals: accountId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs[0] ?? null;
}

/**
 * `account/*` webhooks. A lost account is written from the event alone — the
 * provider may no longer answer for it. Anything else re-reads the account,
 * because the event carries a status but not the flags or requirements.
 */
export async function applyAccountEvent(
	req: PayloadRequest,
	event: AccountEvent,
	deps: ProviderDeps & { now?: Date } = {},
): Promise<ConnectedAccount | null> {
	const row = await rowForProviderAccount(req, event.accountId);
	if (!row) return null;
	const now = deps.now ?? new Date();
	if (LOST_STATUSES.includes(event.status)) {
		return applyAccountState(req, row, { status: event.status }, now);
	}
	const { provider } = await resolveDeps(req.payload, deps);
	const state = await callProvider(() =>
		provider.getConnectedAccount(event.accountId),
	);
	return applyAccountState(req, row, state, now);
}

/** The `syncConnectedAccount` job's unit of work: pull and apply one row. */
export async function syncConnectedAccount(
	req: PayloadRequest,
	connectedAccountId: string,
	deps: ProviderDeps & { now?: Date } = {},
): Promise<ConnectedAccount | null> {
	const row = (await req.payload
		.findByID({
			collection: "connected-accounts",
			id: connectedAccountId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null)) as ConnectedAccount | null;
	const accountId = row?.providerAccountId;
	if (!row || !accountId) return null;
	const { provider } = await resolveDeps(req.payload, deps);
	const state = await callProvider(() =>
		provider.getConnectedAccount(accountId),
	);
	return applyAccountState(req, row, state, deps.now ?? new Date());
}

/**
 * The owner is back from hosted onboarding: pull the row now rather than at
 * the next 6-hourly sweep. Settled (`active`) or closed rows have nothing to
 * learn from it.
 */
export async function queueSyncOnOnboardingReturn(
	payload: Payload,
	shopId: string,
): Promise<void> {
	const account = await findConnectedAccount(payload, shopId);
	if (!account || !SYNC_ON_RETURN.has(account.status)) return;
	await payload.jobs.queue({
		task: "syncConnectedAccount",
		queue: "payments",
		input: { connectedAccountId: String(account.id) },
	});
}

const SYNC_ON_RETURN: ReadonlySet<ConnectedAccount["status"]> = new Set([
	"onboarding",
	"restricted",
]);

function ineligibleReasonOf(
	shop: Shop,
	settings: PaymentSettings,
	now: Date,
): PaymentSetupView["ineligibleReason"] {
	if (shop.status !== "active") return "shopStatus";
	if (!shopCapabilities(shop, now).protectedPayment) return "level";
	if (!marketOf(settings, shop)?.enabled) return "market";
	return null;
}

async function cooldownUntil(
	payload: Payload,
	shopId: string,
	now: Date,
): Promise<string | null> {
	const { docs } = await payload.find({
		collection: "payout-accounts",
		where: {
			and: [{ shop: { equals: shopId } }, { activatedAt: { exists: true } }],
		},
		sort: "-activatedAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const last = docs[0]?.activatedAt;
	if (!last) return null;
	const until = Date.parse(last) + PAYOUT_ACCOUNT_CHANGE_COOLDOWN_MS;
	return until > now.getTime() ? new Date(until).toISOString() : null;
}

/**
 * `GET /api/shops/{id}/payments/setup`: the owner, a manager and platform
 * staff. Holds go out as a category, never the reason.
 */
export async function paymentSetupView(
	payload: Payload,
	shop: Shop,
	user: ServiceUser,
	now: Date = new Date(),
): Promise<PaymentSetupView> {
	await requirePaymentsViewer(payload, user, shop);

	const shopId = String(shop.id);
	const settings = await getPaymentSettings(payload);
	const [account, payoutAccounts, holds, changeCooldownUntil] =
		await Promise.all([
			findConnectedAccount(payload, shopId),
			payload.find({
				collection: "payout-accounts",
				where: {
					and: [
						{ shop: { equals: shopId } },
						{
							status: {
								in: ["active", "pending_verification", "pending_review"],
							},
						},
					],
				},
				sort: "-createdAt",
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			}),
			payload.find({
				collection: "payout-holds",
				where: {
					and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
				},
				sort: "createdAt",
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			}),
			cooldownUntil(payload, shopId, now),
		]);

	const active = payoutAccounts.docs.find((row) => row.status === "active");
	const pending = payoutAccounts.docs.find((row) => row.status !== "active");
	const ineligibleReason = ineligibleReasonOf(shop, settings, now);

	return {
		flagEnabled: isProtectedPaymentOpen(
			settings,
			shopMarketCountry(shop, settings),
		),
		eligible: ineligibleReason === null,
		ineligibleReason,
		connectedAccount: account
			? {
					status: account.status,
					chargesEnabled: account.chargesEnabled === true,
					payoutsEnabled: account.payoutsEnabled === true,
					requirementsDue: requirementsOf(account.requirementsDue),
					lastSyncedAt: account.lastSyncedAt ?? null,
				}
			: null,
		payoutAccount: active
			? {
					method: active.method,
					accountName: active.accountName,
					accountNumberMasked: active.accountNumberMasked ?? "",
					status: active.status,
					activatedAt: active.activatedAt ?? null,
				}
			: null,
		pendingAccount: pending
			? {
					method: pending.method,
					accountNumberMasked: pending.accountNumberMasked ?? "",
					status: pending.status,
				}
			: null,
		holds: holdsView(holds.docs),
		changeCooldownUntil,
		payoutChangeHoldHours: settings.payoutAccountChangeHoldHours,
	};
}
