import type { Payload, PayloadRequest, Where } from "payload";
import { can, resolveShopRole } from "../access/shopRoles";
import {
	PAYOUT_METHOD_CHANNELS,
	type PayoutMethod,
	payoutAccountNumberProblem,
} from "../collections/PayoutAccounts";
import { ERROR_CODES } from "../lib/errors";
import { nameMatch } from "../lib/nameMatch";
import { CHANNEL_DIAL_CODES } from "../lib/paymentMath";
import { getPaymentSettings } from "../lib/paymentSettings";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import {
	commitContextOf,
	onCommit,
	RetryTransaction,
	withTransaction,
} from "../lib/transactions";
import type { PayoutAccount, PayoutHold, Shop } from "../payload-types";
import {
	notifyPayoutAccountActivated,
	notifyPayoutAccountChanged,
	notifyPayoutAccountReview,
} from "./paymentNotifications";
import { createHold, findActiveHold } from "./payoutHolds";
import { findShop } from "./shopGuards";
import type { ServiceUser } from "./shops";

export const PAYOUT_CHANGE_HOLD_HOURS = 72;
export const PAYOUT_CHANGE_COOLDOWN_DAYS = 7;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MASK = "•";

export interface PayoutAccountInput {
	method: PayoutMethod;
	accountName: string;
	accountNumber: string;
}

/** The row as its owner sees it: never the full number. */
export interface PayoutAccountView {
	id: string;
	method: PayoutMethod;
	accountName: string;
	accountNumberMasked: string;
	status: PayoutAccount["status"];
	nameMatch: "match" | "partial" | "mismatch" | null;
	activatedAt: string | null;
	createdAt: string;
}

export function serializePayoutAccount(row: PayoutAccount): PayoutAccountView {
	return {
		id: String(row.id),
		method: row.method,
		accountName: row.accountName,
		accountNumberMasked: row.accountNumberMasked ?? "",
		status: row.status,
		nameMatch: row.nameMatch?.result ?? null,
		activatedAt: row.activatedAt ?? null,
		createdAt: row.createdAt,
	};
}

/**
 * Mobile money: `+<dial code> ` then the national number grouped from the
 * right as 2-2-2 with the rest in front, showing only its first digit, the
 * last digit of the third group and the last group: `+237671234421` gives
 * `+237 6•• •• •4 21`. Bank: every digit masked but the last four.
 */
export function maskAccountNumber(
	method: PayoutMethod,
	accountNumber: string,
): string {
	const digits = accountNumber.replace(/\D/g, "");
	if (method === "bank") {
		return `${MASK.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
	}
	const dial = CHANNEL_DIAL_CODES[PAYOUT_METHOD_CHANNELS[method]];
	const national = digits.startsWith(dial) ? digits.slice(dial.length) : digits;
	if (national.length < 7) return MASK.repeat(national.length);
	const lead = national.slice(0, -6);
	const groups = [
		lead[0] + MASK.repeat(lead.length - 1),
		MASK.repeat(2),
		MASK + national.slice(-3, -2),
		national.slice(-2),
	];
	return `+${dial} ${groups.join(" ")}`;
}

/** Clients may send the number as it is printed; only digits and `+` are kept. */
function normalizeNumber(raw: string): string {
	return raw.replace(/[\s.-]/g, "");
}

function webUrl(): string {
	return process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com";
}

export function notMeUrl(shopId: string, accountId: string): string {
	return `${webUrl()}/seller/payments/setup?shop=${encodeURIComponent(shopId)}&notMe=${encodeURIComponent(accountId)}`;
}

async function shopAccounts(
	req: PayloadRequest,
	shopId: string,
	where: Where,
	sort?: string,
): Promise<PayoutAccount[]> {
	const found = await req.payload.find({
		collection: "payout-accounts",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		sort,
		where: { and: [{ shop: { equals: shopId } }, where] },
	});
	return found.docs as PayoutAccount[];
}

/** The latest activation of any of the shop's rows, replaced ones included. */
async function lastActivation(
	req: PayloadRequest,
	shopId: string,
): Promise<Date | null> {
	const [latest] = await shopAccounts(
		req,
		shopId,
		{ activatedAt: { exists: true } },
		"-activatedAt",
	);
	return latest?.activatedAt ? new Date(latest.activatedAt) : null;
}

/**
 * When the shop may next change its payout account, or null when it may now.
 * Counted from activation, not creation: an account approved after a week in
 * review starts its own seven days.
 */
export async function payoutChangeCooldownUntil(
	req: PayloadRequest,
	shopId: string,
	now = new Date(),
): Promise<string | null> {
	const last = await lastActivation(req, shopId);
	if (!last) return null;
	const until = last.getTime() + PAYOUT_CHANGE_COOLDOWN_DAYS * DAY_MS;
	return until > now.getTime() ? new Date(until).toISOString() : null;
}

/**
 * The name the payout account must carry: the owner's level-2 identity, read
 * from the approved request P2 links on the user. Null when the identity is
 * not (or no longer) verified, or its names were cleared.
 */
async function ownerIdentityName(
	req: PayloadRequest,
	shop: Shop,
): Promise<string | null> {
	const ownerId = relationId(shop.owner);
	if (!ownerId) return null;
	const owner = await req.payload.findByID({
		collection: "users",
		id: ownerId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const requestId = relationId(owner.identityVerification);
	if (!owner.identityVerifiedAt || !requestId) return null;
	const request = await req.payload.findByID({
		collection: "verification-requests",
		id: requestId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (request.status !== "approved") return null;
	const name = [request.kyc?.givenNames, request.kyc?.familyName]
		.filter((part): part is string => Boolean(part?.trim()))
		.join(" ")
		.trim();
	return name || null;
}

/**
 * Serialises every payout-account write of one shop. A compare-and-swap on
 * the shop row's `updatedAt`: two transactions racing it collide on one
 * document, which Mongo resolves with a write conflict and the in-memory fake
 * with a null result; either way the loser re-runs against the winner's
 * committed rows. Without it, two first accounts would both see "no active
 * row" and both activate.
 */
async function lockShop(req: PayloadRequest, shop: Shop): Promise<void> {
	const locked: unknown = await req.payload.db.updateOne({
		collection: "shops",
		where: {
			and: [
				{ id: { equals: String(shop.id) } },
				{ updatedAt: { equals: shop.updatedAt } },
			],
		},
		data: { updatedAt: new Date().toISOString() },
		req,
		returning: true,
	});
	if (locked === null || locked === undefined) {
		throw new RetryTransaction("another payout-account write holds this shop");
	}
}

function noticeOf(shop: Shop, account: PayoutAccount) {
	return {
		shopId: String(shop.id),
		ownerId: relationId(shop.owner) ?? relationId(account.createdBy) ?? "",
		accountId: String(account.id),
		method: account.method,
		accountNumberMasked: account.accountNumberMasked ?? "",
	};
}

async function afterCommit(
	req: PayloadRequest,
	work: () => Promise<void>,
): Promise<void> {
	if (!onCommit(commitContextOf(req), work)) await work();
}

/**
 * Everything that follows a row becoming `active`: every other active row is
 * replaced, a change after an earlier activation opens the 72-hour hold, and
 * the owner is told after commit. `account` is already written as active.
 */
async function completeActivation(
	req: PayloadRequest,
	shop: Shop,
	account: PayoutAccount,
	previous: Date | null,
	now: Date,
): Promise<{ replaced: PayoutAccount[]; holdUntil: string | null }> {
	const shopId = String(shop.id);
	const replacing = await shopAccounts(req, shopId, {
		and: [
			{ status: { equals: "active" } },
			{ id: { not_equals: String(account.id) } },
		],
	});
	const replaced: PayoutAccount[] = [];
	for (const row of replacing) {
		replaced.push(
			(await req.payload.update({
				collection: "payout-accounts",
				id: row.id,
				overrideAccess: true,
				req,
				data: { status: "replaced", replacedAt: now.toISOString() },
			})) as PayoutAccount,
		);
	}

	let holdUntil: string | null = null;
	// The hours come from settings (payments.payoutAccountChangeHoldHours):
	// the constant is only the reader's own default. Hold and SMS share the
	// one figure, so the message can never promise a window the hold does not
	// keep.
	const holdHours =
		(await getPaymentSettings(req.payload)).payoutAccountChangeHoldHours ??
		PAYOUT_CHANGE_HOLD_HOURS;
	if (previous) {
		holdUntil = new Date(now.getTime() + holdHours * HOUR_MS).toISOString();
		await createHold(req, {
			scope: "shop",
			shop: shopId,
			reason: "payout_account_changed",
			until: holdUntil,
			createdByType: "system",
		});
	}

	const notice = noticeOf(shop, account);
	const payload = req.payload;
	const changedUntil = holdUntil;
	await afterCommit(req, async () => {
		await notifyPayoutAccountActivated(payload, notice);
		if (changedUntil) {
			await notifyPayoutAccountChanged(payload, {
				...notice,
				holdUntil: changedUntil,
				holdHours,
				notMeUrl: notMeUrl(shopId, notice.accountId),
			});
		}
	});
	return { replaced, holdUntil };
}

export interface PayoutAccountActivation {
	account: PayoutAccount;
	replaced: PayoutAccount[];
	holdUntil: string | null;
}

/**
 * Staff approval of a `pending_review` row: the same activation an owner's
 * `match` gets, change hold included. Runs inside the caller's transaction;
 * the caller has already decided who may approve.
 */
export async function activateReviewedPayoutAccount(
	req: PayloadRequest,
	shop: Shop,
	account: PayoutAccount,
	now: Date = new Date(),
): Promise<PayoutAccountActivation> {
	const previous = await lastActivation(req, String(shop.id));
	await lockShop(req, shop);
	const activated = (await req.payload.update({
		collection: "payout-accounts",
		id: account.id,
		overrideAccess: true,
		req,
		data: { status: "active", activatedAt: now.toISOString() },
	})) as PayoutAccount;
	const { replaced, holdUntil } = await completeActivation(
		req,
		shop,
		activated,
		previous,
		now,
	);
	return { account: activated, replaced, holdUntil };
}

/**
 * Validates in the spec's order, then records the row with the verdict's
 * status. Runs inside the caller's transaction (`req`). A `match` activates
 * and replaces the previous active row; a second or later activation opens
 * the 72-hour `payout_account_changed` hold in the same transaction.
 */
export async function createPayoutAccount(
	req: PayloadRequest,
	shop: Shop,
	user: ServiceUser,
	input: PayoutAccountInput,
): Promise<PayoutAccount> {
	const shopId = String(shop.id);
	const role = await resolveShopRole(req.payload, user.id, shopId, req.context);
	if (!role || !can(role, "payments.manage")) {
		throw new ServiceError(ERROR_CODES.payoutOwnerOnly, 403);
	}

	const capabilities = shopCapabilities(shop);
	const identityName =
		capabilities.effectiveLevel >= 2
			? await ownerIdentityName(req, shop)
			: null;
	if (!identityName) {
		throw new ServiceError(ERROR_CODES.paymentShopNotEligible, 403);
	}

	if (input.method === "bank") {
		throw new ServiceError(ERROR_CODES.payoutMethodUnavailable, 400);
	}

	const accountNumber = normalizeNumber(input.accountNumber);
	if (payoutAccountNumberProblem(input.method, accountNumber)) {
		throw new ServiceError(ERROR_CODES.payoutAccountInvalid, 400);
	}

	const now = new Date();
	// D-7 (P5 checkpoint): payout.holdActive was declared and translated with
	// no thrower. Its job is here — a shop under an account-change hold or a
	// fraud hold does not get to swap its money destination mid-investigation;
	// before this, only the 7-day cooldown stood in the way.
	for (const reason of ["payout_account_changed", "fraud_signal"] as const) {
		const hold = await findActiveHold(req, {
			scope: "shop",
			shop: shopId,
			reason,
		});
		if (hold) {
			throw new ServiceError(ERROR_CODES.payoutHoldActive, 409, undefined, {
				until: hold.until ?? null,
			});
		}
	}
	const previous = await lastActivation(req, shopId);
	if (
		previous &&
		now.getTime() - previous.getTime() < PAYOUT_CHANGE_COOLDOWN_DAYS * DAY_MS
	) {
		throw new ServiceError(
			ERROR_CODES.payoutAccountChangeCooldown,
			409,
			undefined,
			{
				until: new Date(
					previous.getTime() + PAYOUT_CHANGE_COOLDOWN_DAYS * DAY_MS,
				).toISOString(),
			},
		);
	}

	const accountName = input.accountName.trim();
	const businessName =
		capabilities.legalInfoVerified && shop.legal?.legalName
			? shop.legal.legalName
			: undefined;
	const verdict = nameMatch({
		candidate: accountName,
		identityName,
		businessName,
	});
	const status =
		verdict.result === "match"
			? "active"
			: verdict.result === "partial"
				? "pending_review"
				: "rejected";

	await lockShop(req, shop);

	const account = (await req.payload.create({
		collection: "payout-accounts",
		overrideAccess: true,
		req,
		data: {
			shop: shopId,
			method: input.method,
			accountName,
			accountNumber,
			accountNumberMasked: maskAccountNumber(input.method, accountNumber),
			status,
			nameMatch: {
				identityName,
				result: verdict.result,
				score: verdict.score,
				checkedAt: now.toISOString(),
			},
			...(status === "active" ? { activatedAt: now.toISOString() } : {}),
			createdBy: user.id,
		},
	})) as PayoutAccount;

	if (status === "active") {
		await completeActivation(req, shop, account, previous, now);
	} else {
		const notice = noticeOf(shop, account);
		const payload = req.payload;
		await afterCommit(req, () =>
			notifyPayoutAccountReview(payload, {
				...notice,
				result: status === "pending_review" ? "partial" : "mismatch",
			}),
		);
	}

	return account;
}

/**
 * The route's entry point: one transaction around `createPayoutAccount`. A
 * `mismatch` row is committed (records are never deleted) and only then
 * answered as `payout.accountNameMismatch`.
 */
export async function submitPayoutAccount(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: PayoutAccountInput,
): Promise<PayoutAccountView> {
	const account = await withTransaction(
		payload,
		async (req) => {
			const shop = await findShop(req.payload, shopId, req);
			return createPayoutAccount(req, shop, user, input);
		},
		{ user },
	);
	const view = serializePayoutAccount(account);
	if (account.status === "rejected") {
		throw new ServiceError(
			ERROR_CODES.payoutAccountNameMismatch,
			422,
			undefined,
			{ account: view },
		);
	}
	return view;
}

export interface PayoutAccountReversion {
	restored: PayoutAccount;
	disowned: PayoutAccount;
	hold: PayoutHold;
}

/**
 * "This was not me": the disowned row is rejected, the account it replaced
 * becomes active again, and the change hold stays open with no end date,
 * escalated to `fraud_signal` so moderation reviews it. Runs inside the
 * caller's transaction; the caller has already established who may ask.
 */
export async function revertPayoutAccount(
	req: PayloadRequest,
	shop: Shop,
	accountId: string,
): Promise<PayoutAccountReversion> {
	const shopId = String(shop.id);
	const [disowned] = await shopAccounts(req, shopId, {
		id: { equals: accountId },
	});
	if (!disowned) throw new ServiceError(ERROR_CODES.notFound, 404);

	const [previous] = await shopAccounts(
		req,
		shopId,
		{ status: { equals: "replaced" } },
		"-replacedAt",
	);
	if (disowned.status !== "active" || !previous) {
		throw new ServiceError(ERROR_CODES.validation, 409);
	}

	await lockShop(req, shop);

	const rejected = (await req.payload.update({
		collection: "payout-accounts",
		id: disowned.id,
		overrideAccess: true,
		req,
		data: { status: "rejected" },
	})) as PayoutAccount;
	const restored = (await req.payload.update({
		collection: "payout-accounts",
		id: previous.id,
		overrideAccess: true,
		req,
		data: { status: "active", replacedAt: null },
	})) as PayoutAccount;

	const open = await req.payload.find({
		collection: "payout-holds",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
		sort: "-createdAt",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ reason: { equals: "payout_account_changed" } },
				{ status: { equals: "active" } },
			],
		},
	});
	const note = "The owner reported this payout account change as not theirs.";
	const changeHold = open.docs[0] as PayoutHold | undefined;
	const hold = changeHold
		? ((await req.payload.update({
				collection: "payout-holds",
				id: changeHold.id,
				overrideAccess: true,
				req,
				data: {
					reason: "fraud_signal",
					until: null,
					blocksCharges: true,
					note,
				},
			})) as PayoutHold)
		: await createHold(req, {
				scope: "shop",
				shop: shopId,
				reason: "fraud_signal",
				until: null,
				createdByType: "system",
			});

	return { restored, disowned: rejected, hold };
}

/** The not-me route's entry point: owner only, one transaction. */
export async function reportPayoutAccountNotMe(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	accountId: string,
): Promise<{ restored: PayoutAccountView; disowned: PayoutAccountView }> {
	const result = await withTransaction(
		payload,
		async (req) => {
			const shop = await findShop(req.payload, shopId, req);
			const role = await resolveShopRole(
				req.payload,
				user.id,
				shopId,
				req.context,
			);
			if (!role || !can(role, "payments.manage")) {
				throw new ServiceError(ERROR_CODES.payoutOwnerOnly, 403);
			}
			return revertPayoutAccount(req, shop, accountId);
		},
		{ user },
	);
	return {
		restored: serializePayoutAccount(result.restored),
		disowned: serializePayoutAccount(result.disowned),
	};
}
