import type { Payload } from "payload";
import { type OrderViewer, resolveOrderAudience } from "../access/orderAccess";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import {
	CHANNEL_DIAL_CODES,
	isSamePhoneNumber,
	payerPhoneE164,
	type SplitAmountsResult,
	splitAmounts,
} from "../lib/paymentMath";
import {
	getPaymentSettings,
	isProtectedPaymentFlagOpen,
	type MarketRow,
	type PaymentChannel,
	type PaymentEnv,
	type PaymentSettings,
} from "../lib/paymentSettings";
import type { MarketplaceProvider } from "../lib/payments/marketplace";
import { getMarketplaceProvider } from "../lib/payments/marketplaceRegistry";
import {
	type CounterStore,
	getCounterStore,
	hitRateLimit,
} from "../lib/rateLimit";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import { withTransaction } from "../lib/transactions";
import type {
	ConnectedAccount,
	Order,
	PaymentIntent,
	Shop,
} from "../payload-types";
import { findConnectedAccount, marketOf } from "./connectedAccounts";
import { openProtectedExposure } from "./exposure";
import { applyTransition } from "./orders/transitions";
import {
	createPaymentIntent,
	failIntentBeforeProvider,
	findIntentByIdempotencyKey,
	markIntentPending,
	settlePayment,
} from "./payments";
import { hasBlockingHold } from "./payoutHolds";
import { isUniqueViolation, type ServiceUser } from "./shops";

export const CHECKOUT_MAX_ATTEMPTS = 3;
/** A `created`/`pending` intent younger than this blocks a new attempt. */
export const ATTEMPT_IN_PROGRESS_MS = 3 * 60_000;
export const FAILED_INTENTS_PER_PHONE_PER_HOUR = 3;
/** The status route asks the provider only once an intent has waited this long. */
export const POLL_AFTER_PENDING_MS = 60_000;
export const POLL_INTERVAL_SECONDS = 20;
/** Task 17 serves this path; NotchPay appends its own references on redirect. */
export const CHECKOUT_CALLBACK_PATH = "/api/public/payments/notchpay/callback";

const HOUR_MS = 60 * 60_000;

/** Local API calls accept a partial request; routes only have `payload`. */
export type CheckoutReq = { payload: Payload };

export interface CheckoutIntentInput {
	channel: string;
	phone: string;
	idempotencyKey: string;
}

export interface CheckoutDeps {
	provider?: MarketplaceProvider;
	settings?: PaymentSettings;
	env?: PaymentEnv;
	now?: Date;
	serverUrl?: string;
}

export interface PaymentStatusDeps {
	provider?: MarketplaceProvider;
	settings?: PaymentSettings;
	counterStore?: CounterStore;
	now?: Date;
}

/** `POST /api/orders/{id}/payment-intents` (the plan's contracts section). */
export interface PaymentIntentResponse {
	intentId: string;
	status: "created" | "pending";
	expiresAt: string;
	channel: string;
	attempt: number;
	attemptsLeft: number;
	instructions: string | null;
}

/** `GET /api/orders/{id}/payment` (the plan's contracts section). */
export interface PaymentStatusView {
	orderPaymentStatus: string;
	intent: null | {
		id: string;
		status: string;
		channel: string;
		failureCode: PaymentIntent["failureCode"] | null;
		expiresAt: string;
		attempt: number;
		attemptsLeft: number;
	};
}

type OpenIntent = PaymentIntent & { status: "created" | "pending" };

const isOpen = (intent: PaymentIntent): intent is OpenIntent =>
	intent.status === "created" || intent.status === "pending";

const refuse = (
	code: ErrorCode,
	status: number,
	details?: Record<string, unknown>,
): ServiceError => new ServiceError(code, status, undefined, details);

const toMs = (value: string | null | undefined): number =>
	value ? Date.parse(value) : Number.NaN;

export async function findOrderForPayment(
	payload: Payload,
	orderId: string,
): Promise<Order> {
	try {
		return await payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw refuse(ERROR_CODES.orderNotFound, 404);
	}
}

/** The order's checkout intents, newest first. */
async function orderIntents(
	payload: Payload,
	order: Pick<Order, "id">,
): Promise<PaymentIntent[]> {
	const { docs } = await payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ purpose: { equals: "checkout" } },
				{ targetType: { equals: "order" } },
				{ targetId: { equals: String(order.id) } },
			],
		},
		sort: "-createdAt",
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	return docs;
}

function attemptInProgress(
	intents: readonly PaymentIntent[],
	now: Date,
): OpenIntent | null {
	return (
		intents
			.filter(isOpen)
			.find(
				(intent) =>
					now.getTime() - toMs(intent.createdAt) < ATTEMPT_IN_PROGRESS_MS,
			) ?? null
	);
}

// ─── Rule 1: the order is the caller's and still payable ─────────────────────

/** When the order's checkout window closes and `expireOrders` cancels it. */
const checkoutWindowEnd = (order: Order, settings: PaymentSettings): number =>
	toMs(order.timestamps?.placedAt ?? order.createdAt) +
	settings.checkoutExpiryMinutes * 60_000;

function assertPayable(
	order: Order,
	user: ServiceUser,
	settings: PaymentSettings,
	now: Date,
): void {
	if (relationId(order.buyer) !== user.id) {
		throw refuse(ERROR_CODES.paymentOrderNotPayable, 403);
	}
	const payable =
		order.status === "placed" &&
		order.paymentMethod === "mobile_money" &&
		(order.paymentStatus === "unpaid" ||
			order.paymentStatus === "awaiting_payment") &&
		now.getTime() < checkoutWindowEnd(order, settings);
	if (!payable) throw refuse(ERROR_CODES.paymentOrderNotPayable, 409);
}

// ─── Rule 2: the shop may take a protected payment for this order ────────────

async function commissionOf(payload: Payload, order: Order): Promise<number> {
	const { docs } = await payload.find({
		collection: "order-items",
		where: { order: { equals: String(order.id) } },
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	return docs.reduce((sum, item) => sum + (item.commissionAmount ?? 0), 0);
}

/**
 * The amounts the first attempt froze onto the order, or a fresh split. A
 * settings change between two attempts never re-prices an order mid-payment.
 */
async function amountsFor(
	payload: Payload,
	order: Order,
	settings: PaymentSettings,
	market: MarketRow,
): Promise<SplitAmountsResult> {
	const a = order.amounts;
	if (
		order.settlement?.connectedAccount &&
		typeof a?.applicationFee === "number" &&
		typeof a.destinationAmount === "number" &&
		typeof a.total === "number"
	) {
		return {
			commission: a.commission ?? 0,
			commissionVat: a.commissionVat ?? 0,
			buyerProtectionFee: a.buyerProtectionFee ?? 0,
			buyerProtectionFeeVat: a.buyerProtectionFeeVat ?? 0,
			applicationFee: a.applicationFee,
			destinationAmount: a.destinationAmount,
			buyerTotal: a.total,
		};
	}
	return splitAmounts({
		orderTotal: (a?.subtotal ?? 0) + (a?.deliveryFee ?? 0),
		commission: await commissionOf(payload, order),
		vatRateBps: market.vatRateBps,
		protection: settings.buyerProtection,
	});
}

interface Eligible {
	market: MarketRow;
	account: ConnectedAccount & { providerAccountId: string };
	amounts: SplitAmountsResult;
}

/**
 * Rule 2's shop-eligibility half, with no order in it: capabilities, the
 * connected account, an active payout account, no blocking hold. Checkout's
 * placement reuses this exact check before any order exists — the market,
 * amount and exposure checks below stay here because they need the order.
 */
export async function assertShopEligibleForProtectedPayment(
	payload: Payload,
	shop: Shop,
	now: Date,
): Promise<void> {
	const notEligible = refuse(ERROR_CODES.paymentShopNotEligible, 403);
	const capabilities = shopCapabilities(shop, now);
	if (!capabilities.protectedPayment) throw notEligible;

	const shopId = String(shop.id);
	const account = await findConnectedAccount(payload, shopId);
	if (
		!account?.providerAccountId ||
		account.status !== "active" ||
		!account.chargesEnabled ||
		!account.payoutsEnabled
	) {
		throw notEligible;
	}
	const payoutAccounts = await payload.count({
		collection: "payout-accounts",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
		},
		overrideAccess: true,
	});
	if (payoutAccounts.totalDocs === 0) throw notEligible;
	if (await hasBlockingHold(payload, shopId)) throw notEligible;
}

async function assertEligible(
	payload: Payload,
	order: Order,
	shop: Shop,
	settings: PaymentSettings,
	env: PaymentEnv,
	now: Date,
): Promise<Eligible> {
	if (!isProtectedPaymentFlagOpen(settings, env)) {
		throw refuse(ERROR_CODES.paymentProtectedDisabled, 403);
	}
	const market = marketOf(settings, shop);
	if (!market?.enabled) {
		throw refuse(ERROR_CODES.paymentMarketUnavailable, 400);
	}
	await assertShopEligibleForProtectedPayment(payload, shop, now);
	const notEligible = refuse(ERROR_CODES.paymentShopNotEligible, 403);
	const capabilities = shopCapabilities(shop, now);

	const shopId = String(shop.id);
	// Re-read: `assertShopEligibleForProtectedPayment` just proved this
	// account exists and is active; the guard below only narrows the type.
	const account = await findConnectedAccount(payload, shopId);
	if (!account?.providerAccountId) throw notEligible;
	const amounts = await amountsFor(payload, order, settings, market);
	if (amounts.buyerTotal > settings.maxOrderAmount) {
		throw refuse(ERROR_CODES.paymentAmountTooHigh, 400);
	}

	// Funds may leave before delivery under the provider's own schedule, so
	// the spec halves the cap there.
	const levelCap = capabilities.fasterPayouts
		? settings.exposureCaps.level3
		: settings.exposureCaps.level2;
	const cap =
		settings.releaseModel === "provider_schedule"
			? Math.floor(levelCap / 2)
			: levelCap;
	const exposure = await openProtectedExposure(
		payload,
		shopId,
		String(order.id),
	);
	if (exposure + amounts.buyerTotal > cap) throw notEligible;

	return {
		market,
		account: { ...account, providerAccountId: account.providerAccountId },
		amounts,
	};
}

// ─── Rule 3: nobody pays their own shop ──────────────────────────────────────

/**
 * The owner and every active member, by account and by verified phone: a
 * stranger's account paying with the owner's number is the same self-purchase
 * as the owner paying from their own account.
 */
async function assertNotSelfPurchase(
	payload: Payload,
	shop: Shop,
	user: ServiceUser,
	phone: string,
	market: MarketRow,
): Promise<void> {
	const { docs: members } = await payload.find({
		collection: "shop-members",
		where: {
			and: [
				{ shop: { equals: String(shop.id) } },
				{ status: { equals: "active" } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const memberIds = new Set(
		[relationId(shop.owner), ...members.map((m) => relationId(m.user))].filter(
			(id): id is string => id !== null,
		),
	);
	if (memberIds.has(user.id)) {
		throw refuse(ERROR_CODES.paymentSelfPurchase, 403);
	}

	const { docs: verified } = await payload.find({
		collection: "users",
		where: {
			and: [
				{ id: { in: [...memberIds] } },
				{ phoneVerifiedAt: { exists: true } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const dialCodes = market.channels.map(
		(channel) => CHANNEL_DIAL_CODES[channel],
	);
	if (
		verified.some(
			(member) =>
				typeof member.phone === "string" &&
				isSamePhoneNumber(phone, member.phone, dialCodes),
		)
	) {
		throw refuse(ERROR_CODES.paymentSelfPurchase, 403);
	}
}

// ─── Rule 4: the market's channel and that operator's number ─────────────────

function assertChannel(
	market: MarketRow,
	channel: string,
	phone: string,
): { channel: PaymentChannel; payerPhone: string } {
	const known = market.channels.find((c) => c === channel);
	if (!known) throw refuse(ERROR_CODES.paymentChannelUnsupported, 400);
	const payerPhone = payerPhoneE164(phone, known);
	if (!payerPhone) throw refuse(ERROR_CODES.phoneInvalid, 400);
	return { channel: known, payerPhone };
}

// ─── Rule 5: attempts, replays and the payer phone's failures ────────────────

/** What a replayed key answers once its intent has left `created`/`pending`. */
function replayRefusal(intent: PaymentIntent): ServiceError {
	switch (intent.status) {
		case "failed": {
			const byCode: Record<
				NonNullable<PaymentIntent["failureCode"]>,
				[ErrorCode, number]
			> = {
				provider_error: [ERROR_CODES.paymentProviderUnavailable, 503],
				declined: [ERROR_CODES.paymentDeclined, 409],
				insufficient_funds: [ERROR_CODES.paymentInsufficientFunds, 409],
				timeout: [ERROR_CODES.paymentTimeout, 409],
				limit_exceeded: [ERROR_CODES.paymentLimitExceeded, 409],
				invalid_number: [ERROR_CODES.phoneInvalid, 400],
			};
			const [code, status] = byCode[intent.failureCode ?? "provider_error"];
			return refuse(code, status);
		}
		case "expired":
		case "cancelled":
			return refuse(ERROR_CODES.paymentExpired, 409);
		default:
			return refuse(ERROR_CODES.paymentOrderNotPayable, 409);
	}
}

function intentResponse(
	intent: PaymentIntent,
	instructions: string | null,
): PaymentIntentResponse {
	const attempt = intent.attempt ?? 1;
	return {
		intentId: String(intent.id),
		// A webhook can settle the intent before this answer is built; the
		// client polls the status route for anything past `pending`.
		status: intent.status === "created" ? "created" : "pending",
		expiresAt: intent.expiresAt ?? "",
		channel: intent.channel ?? "",
		attempt,
		attemptsLeft: Math.max(0, CHECKOUT_MAX_ATTEMPTS - attempt),
		instructions,
	};
}

function replayOf(
	intent: PaymentIntent,
	order: Order,
	user: ServiceUser,
): PaymentIntentResponse {
	if (
		intent.purpose !== "checkout" ||
		intent.targetId !== String(order.id) ||
		relationId(intent.customer) !== user.id
	) {
		throw refuse(ERROR_CODES.badRequest, 400);
	}
	if (!isOpen(intent)) throw replayRefusal(intent);
	return intentResponse(intent, null);
}

/** A provider outage is not the payer's doing, so it never counts against the phone. */
async function recentFailuresFor(
	payload: Payload,
	payerPhone: string,
	now: Date,
): Promise<number> {
	const { totalDocs } = await payload.count({
		collection: "payment-intents",
		where: {
			and: [
				{ purpose: { equals: "checkout" } },
				{ payerPhone: { equals: payerPhone } },
				{ status: { equals: "failed" } },
				{ failureCode: { not_equals: "provider_error" } },
				{
					createdAt: {
						greater_than_equal: new Date(now.getTime() - HOUR_MS).toISOString(),
					},
				},
			],
		},
		overrideAccess: true,
	});
	return totalDocs;
}

// ─── The entry point ─────────────────────────────────────────────────────────

async function loadShop(payload: Payload, order: Order): Promise<Shop> {
	const shopId = relationId(order.shop);
	if (!shopId) throw refuse(ERROR_CODES.paymentShopNotEligible, 403);
	try {
		return await payload.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw refuse(ERROR_CODES.paymentShopNotEligible, 403);
	}
}

/**
 * `POST /api/orders/{id}/payment-intents`: the spec's eight numbered rules in
 * their order, so that each rule's refusal wins over every later one's.
 */
export async function createCheckoutIntent(
	req: CheckoutReq,
	order: Order,
	user: ServiceUser,
	input: CheckoutIntentInput,
	deps: CheckoutDeps = {},
): Promise<PaymentIntentResponse> {
	const { payload } = req;
	const now = deps.now ?? new Date();
	const settings = deps.settings ?? (await getPaymentSettings(payload));

	assertPayable(order, user, settings, now);

	const shop = await loadShop(payload, order);
	const { market, account, amounts } = await assertEligible(
		payload,
		order,
		shop,
		settings,
		deps.env ?? process.env,
		now,
	);

	await assertNotSelfPurchase(payload, shop, user, input.phone, market);

	const { channel, payerPhone } = assertChannel(
		market,
		input.channel,
		input.phone,
	);

	// Namespaced by caller, as P0's boost keys are, so two buyers' keys can
	// never collide.
	const idempotencyKey = `checkout:${user.id}:${input.idempotencyKey}`;
	const replay = await findIntentByIdempotencyKey(payload, idempotencyKey);
	if (replay) return replayOf(replay, order, user);
	const intents = await orderIntents(payload, order);
	const inProgress = attemptInProgress(intents, now);
	if (inProgress) {
		throw refuse(ERROR_CODES.paymentAttemptInProgress, 409, {
			intentId: String(inProgress.id),
		});
	}
	if (intents.length >= CHECKOUT_MAX_ATTEMPTS) {
		throw refuse(ERROR_CODES.paymentTooManyAttempts, 409);
	}
	if (
		(await recentFailuresFor(payload, payerPhone, now)) >=
		FAILED_INTENTS_PER_PHONE_PER_HOUR
	) {
		throw refuse(ERROR_CODES.rateLimited, 429);
	}

	const provider =
		deps.provider ??
		getMarketplaceProvider(settings, { countryCode: market.countryCode });
	const attempt = intents.length + 1;

	let intent: PaymentIntent;
	try {
		intent = await withTransaction(payload, async (txReq) => {
			const created = await createPaymentIntent(
				payload,
				{
					purpose: "checkout",
					targetType: "order",
					targetId: String(order.id),
					customerId: user.id,
					amount: amounts.buyerTotal,
					currency: market.currency,
					provider: market.provider,
					idempotencyKey,
					now,
					// A later attempt never outlives the order: the buyer's countdown
					// must end when `expireOrders` cancels it, or a payment approved
					// after that is taken and refunded as late.
					expiresAt: new Date(
						Math.min(
							now.getTime() + settings.checkoutExpiryMinutes * 60_000,
							checkoutWindowEnd(order, settings),
						),
					),
					checkout: {
						channel,
						payerPhone,
						connectedAccount: String(account.id),
						applicationFee: amounts.applicationFee,
						destinationAmount: amounts.destinationAmount,
						attempt,
					},
				},
				txReq,
			);
			// The first attempt moves the order and freezes its amounts; the
			// conditional write on `paymentStatus` is also what lets exactly one
			// of two simultaneous first attempts through.
			if (order.paymentStatus === "unpaid") {
				await applyTransition(
					txReq,
					order,
					{
						paymentStatus: "awaiting_payment",
						set: {
							amounts: {
								...order.amounts,
								buyerProtectionFee: amounts.buyerProtectionFee,
								buyerProtectionFeeVat: amounts.buyerProtectionFeeVat,
								commission: amounts.commission,
								commissionVat: amounts.commissionVat,
								applicationFee: amounts.applicationFee,
								destinationAmount: amounts.destinationAmount,
								total: amounts.buyerTotal,
							},
							settlement: {
								...order.settlement,
								mode: market.settlementMode,
								releaseModel: settings.releaseModel,
								connectedAccount: String(account.id),
							},
						},
					},
					{
						type: "order.note_added",
						actorType: "buyer",
						actor: user.id,
						visibility: "staff",
						note: `Protected payment attempt ${attempt} started`,
						metadata: { intentId: String(created.id), attempt, channel },
					},
				);
			}
			return created;
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			const winner = await findIntentByIdempotencyKey(payload, idempotencyKey);
			if (winner) return replayOf(winner, order, user);
		}
		if (
			error instanceof ServiceError &&
			error.code === ERROR_CODES.orderInvalidTransition
		) {
			const winner = attemptInProgress(await orderIntents(payload, order), now);
			if (winner) {
				throw refuse(ERROR_CODES.paymentAttemptInProgress, 409, {
					intentId: String(winner.id),
				});
			}
			throw refuse(ERROR_CODES.paymentOrderNotPayable, 409);
		}
		throw error;
	}

	const intentId = String(intent.id);
	const reference = intent.reference ?? `PI-${intentId}`;
	let charge: { providerReference: string; checkoutUrl?: string } | null = null;
	let pushed: { action?: string };
	try {
		charge = await provider.createDestinationCharge({
			reference,
			amount: amounts.buyerTotal,
			currency: market.currency,
			applicationFee: amounts.applicationFee,
			destination: {
				accountId: account.providerAccountId,
				amount: amounts.destinationAmount,
			},
			customer: {
				email: user.email ?? "",
				name: user.name ?? undefined,
				phone: payerPhone,
			},
			description: `Order ${order.orderNumber}`,
			callbackUrl: `${deps.serverUrl ?? process.env.PAYLOAD_PUBLIC_SERVER_URL ?? ""}${CHECKOUT_CALLBACK_PATH}?orderId=${encodeURIComponent(String(order.id))}`,
		});
		pushed = await provider.chargeMobileMoney(reference, {
			channel,
			phone: payerPhone,
		});
	} catch (error) {
		payload.logger.error({
			msg: "[checkout-payment] the provider refused or failed the charge",
			intentId,
			err: error,
		});
		await failIntentBeforeProvider(payload, intentId, {
			failureCode: "provider_error",
			providerReference: charge?.providerReference ?? null,
			now,
		});
		throw refuse(ERROR_CODES.paymentProviderUnavailable, 503);
	}

	const pending = await markIntentPending(payload, intentId, {
		providerReference: charge.providerReference,
		checkoutUrl: charge.checkoutUrl ?? null,
		now,
	});
	return intentResponse(pending, pushed.action ?? null);
}

// ─── The status route ────────────────────────────────────────────────────────

function pendingSince(intent: PaymentIntent): number {
	const entry = [...(intent.statusHistory ?? [])]
		.reverse()
		.find((h) => h.status === "pending");
	return toMs(entry?.at ?? intent.createdAt);
}

function statusViewOf(
	order: Order,
	intent: PaymentIntent | null,
): PaymentStatusView {
	if (!intent) return { orderPaymentStatus: order.paymentStatus, intent: null };
	const attempt = intent.attempt ?? 1;
	return {
		orderPaymentStatus: order.paymentStatus,
		intent: {
			id: String(intent.id),
			status: intent.status,
			channel: intent.channel ?? "",
			failureCode: intent.failureCode ?? null,
			expiresAt: intent.expiresAt ?? "",
			attempt,
			attemptsLeft: Math.max(0, CHECKOUT_MAX_ATTEMPTS - attempt),
		},
	};
}

/**
 * `GET /api/orders/{id}/payment`, for the buyer or a member of the shop. An
 * intent left `pending` past a minute is checked with the provider — at most
 * once per 20 s window per intent, whoever is asking — and settled exactly as
 * the provider's callback would be. A failed check is logged and the stored
 * state is answered: the poll is a convenience, the webhook is the truth.
 */
export async function paymentStatusView(
	payload: Payload,
	order: Order,
	caller: OrderViewer,
	deps: PaymentStatusDeps = {},
): Promise<PaymentStatusView> {
	const audience = await resolveOrderAudience(payload, caller, order);
	if (!audience) throw refuse(ERROR_CODES.orderNotFound, 404);

	const now = deps.now ?? new Date();
	const latest = (await orderIntents(payload, order))[0] ?? null;
	if (
		!latest ||
		latest.status !== "pending" ||
		now.getTime() - pendingSince(latest) <= POLL_AFTER_PENDING_MS
	) {
		return statusViewOf(order, latest);
	}

	const limited = await hitRateLimit(
		deps.counterStore ?? getCounterStore(),
		String(latest.id),
		[
			{
				name: "checkout-payment-poll",
				limit: 1,
				windowSeconds: POLL_INTERVAL_SECONDS,
			},
		],
		now.getTime(),
	);
	if (limited) return statusViewOf(order, latest);

	try {
		const provider =
			deps.provider ??
			getMarketplaceProvider(
				deps.settings ?? (await getPaymentSettings(payload)),
			);
		const report = await provider.verifyPayment(
			latest.reference ?? `PI-${latest.id}`,
		);
		await settlePayment(payload, { ...report, source: "callback", at: now });
	} catch (error) {
		payload.logger.warn({
			msg: "[checkout-payment] payment poll failed",
			intentId: String(latest.id),
			err: error,
		});
		return statusViewOf(order, latest);
	}
	const [fresh, freshIntent] = await Promise.all([
		findOrderForPayment(payload, String(order.id)),
		payload.findByID({
			collection: "payment-intents",
			id: String(latest.id),
			depth: 0,
			overrideAccess: true,
		}),
	]);
	return statusViewOf(fresh, freshIntent);
}

export interface CheckoutCallbackDeps {
	provider?: MarketplaceProvider;
	settings?: PaymentSettings;
	now?: Date;
}

/**
 * The hosted checkout's return to `CHECKOUT_CALLBACK_PATH?orderId=`. The
 * redirect itself proves nothing: the order's latest intent, while still
 * open, is verified with the provider and settled like any other report, in
 * whichever order this and the webhook arrive.
 */
export async function settleCheckoutCallback(
	payload: Payload,
	orderId: string,
	deps: CheckoutCallbackDeps = {},
): Promise<string> {
	const latest = (await orderIntents(payload, { id: orderId }))[0];
	if (!latest || !isOpen(latest)) return "no_open_intent";
	const provider =
		deps.provider ??
		getMarketplaceProvider(
			deps.settings ?? (await getPaymentSettings(payload)),
		);
	const report = await provider.verifyPayment(
		latest.reference ?? `PI-${latest.id}`,
	);
	const settled = await settlePayment(payload, {
		...report,
		source: "callback",
		at: deps.now,
	});
	return settled.outcome;
}
