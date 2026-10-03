import type { Payload } from "payload";
import type { PayoutMethod } from "../collections/PayoutAccounts";
import type { ConnectedAccountStatus } from "../lib/payments/marketplace";
import { relationId } from "../lib/relationId";
import type { Shop } from "../payload-types";
import { isNotificationProviderConfigured } from "./notificationProvider";
import { sendSms } from "./smsProvider";

type Value = string | number | boolean | null;
type ShopRef = Pick<Shop, "id" | "name" | "owner">;

async function trigger(
	event: string,
	subscriberId: string | null,
	payload: Record<string, Value>,
) {
	if (!subscriberId || !isNotificationProviderConfigured()) return;
	const { triggerNotificationEvent } = await import(
		"../hooks/notificationEvents"
	);
	await triggerNotificationEvent({ event, subscriberId, payload });
}

async function findShop(payload: Payload, shopId: string | null) {
	if (!shopId) return null;
	return payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
}

async function orderNumberOf(payload: Payload, orderId: string) {
	if (!orderId) return "";
	const order = await payload
		.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	return order?.orderNumber ?? "";
}

async function adminIds(payload: Payload): Promise<string[]> {
	const { docs } = await payload.find({
		collection: "users",
		where: { role: { equals: "admin" } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	return docs.map((admin) => String(admin.id));
}

async function toAdmins(
	payload: Payload,
	event: string,
	data: Record<string, Value>,
) {
	for (const admin of await adminIds(payload)) {
		await trigger(event, admin, data);
	}
}

export type PayoutHoldCategory = "security" | "review" | "operations";

export interface PayoutHoldNotice {
	holdId: string;
	scope: "shop" | "order";
	orderId: string | null;
	/** The category, never the reason: the owner must not learn the fraud rule. */
	category: PayoutHoldCategory;
	cause: "released" | "expired";
}

export async function notifyPayoutHoldReleased(
	shop: ShopRef,
	notice: PayoutHoldNotice,
) {
	await trigger("payout-hold-released", relationId(shop.owner), {
		shopId: String(shop.id),
		shopName: String(shop.name ?? ""),
		holdId: notice.holdId,
		scope: notice.scope,
		orderId: notice.orderId,
		reasonCategory: notice.category,
		cause: notice.cause,
	});
}

// --- Payout-account notices (Task 10) -------------------------------------
export interface PayoutAccountNotice {
	shopId: string;
	ownerId: string;
	accountId: string;
	method: PayoutMethod;
	accountNumberMasked: string;
}

export interface PayoutAccountChangedNotice extends PayoutAccountNotice {
	holdUntil: string;
	holdHours: number;
	notMeUrl: string;
}

const accountFields = (notice: PayoutAccountNotice) => ({
	shopId: notice.shopId,
	accountId: notice.accountId,
	method: notice.method,
	accountNumberMasked: notice.accountNumberMasked,
});

export async function notifyPayoutAccountActivated(
	_payload: Payload,
	notice: PayoutAccountNotice,
): Promise<void> {
	await trigger(
		"payout-account-activated",
		notice.ownerId,
		accountFields(notice),
	);
}

export async function notifyPayoutAccountReview(
	_payload: Payload,
	notice: PayoutAccountNotice & { result: "partial" | "mismatch" },
): Promise<void> {
	await trigger("payout-account-review", notice.ownerId, {
		...accountFields(notice),
		result: notice.result,
	});
}

/**
 * Bilingual because the owner's language is not stored, and GSM-7 throughout
 * (no accent, no ellipsis): one UCS-2 character would turn this two-part
 * message into five. The link is the not-me route, so it is never shortened.
 */
export function payoutAccountChangedSms(
	notMeUrl: string,
	holdHours: number,
): string {
	// The hours are a setting (payments.payoutAccountChangeHoldHours): frozen
	// copy would lie the day an admin moves it — the badge's 3% lesson again.
	return `BuyNSellem: compte de versement modifie, versements bloques ${holdHours}h. Pas vous? / Payout account changed, payouts held ${holdHours}h. Not you? ${notMeUrl}`;
}

/**
 * `payout-account-changed`: push and email through Novu, and an SMS to the
 * owner's verified phone through `smsProvider` — sent even when Novu is not
 * configured, because this is the notice that lets an owner stop a hijack.
 */
export async function notifyPayoutAccountChanged(
	payload: Payload,
	notice: PayoutAccountChangedNotice,
): Promise<void> {
	await trigger("payout-account-changed", notice.ownerId, {
		...accountFields(notice),
		holdUntil: notice.holdUntil,
		notMeUrl: notice.notMeUrl,
	});

	const owner = await payload
		.findByID({
			collection: "users",
			id: notice.ownerId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!owner?.phone || !owner.phoneVerifiedAt) return;
	try {
		await sendSms(payload, {
			to: owner.phone,
			message: payoutAccountChangedSms(notice.notMeUrl, notice.holdHours),
		});
	} catch (error) {
		payload.logger.error(
			{ err: error, shopId: notice.shopId },
			"[payments] payout-account-changed SMS failed",
		);
	}
}

// --- Connected-account notices (Task 9) -----------------------------------
/**
 * A connected account went `disabled` or `deauthorized` and a charge-blocking
 * hold was placed. The owner gets the hold's category only; admins get the
 * provider status, which is what they have to chase.
 */
export async function notifyConnectedAccountLost(
	payload: Payload,
	input: { shopId: string; status: ConnectedAccountStatus },
) {
	if (!isNotificationProviderConfigured()) return;
	const shop = await findShop(payload, input.shopId);
	if (!shop) return;
	await trigger("payout-hold-placed", relationId(shop.owner), {
		shopId: input.shopId,
		shopName: shop.name,
		holdId: null,
		scope: "shop",
		orderId: null,
		reasonCategory: "security",
		checkPayoutAccount: false,
	});
	await toAdmins(payload, "payments-connected-account-lost", {
		shopId: input.shopId,
		shopName: shop.name,
		status: input.status,
	});
}

/**
 * `payments-onboarding-action`: the connected account became `restricted` or
 * the provider started asking for something. Fired on the transition only.
 */
export async function notifyPaymentsOnboardingAction(
	payload: Payload,
	input: {
		shopId: string;
		status: ConnectedAccountStatus;
		requirementsDue: string[];
	},
): Promise<void> {
	if (!isNotificationProviderConfigured()) return;
	const shop = await findShop(payload, input.shopId);
	if (!shop) return;
	await trigger("payments-onboarding-action", relationId(shop.owner), {
		shopId: input.shopId,
		shopName: shop.name,
		status: input.status,
		requirementsCount: input.requirementsDue.length,
	});
}

// --- Refund notices (Task 15) ---------------------------------------------
export interface RefundNoticeInput {
	refundId: string;
	orderId: string;
	buyerId: string | null;
	shopId: string | null;
	amount: number;
	currency: string;
	reason: string;
}

async function refundFields(payload: Payload, notice: RefundNoticeInput) {
	return {
		refundId: notice.refundId,
		orderId: notice.orderId,
		orderNumber: await orderNumberOf(payload, notice.orderId),
		amount: notice.amount,
		currency: notice.currency,
		reason: notice.reason,
	};
}

/** `refund-initiated`: the buyer, and the owner. */
export async function notifyRefundInitiated(
	payload: Payload,
	notice: RefundNoticeInput,
): Promise<void> {
	if (!isNotificationProviderConfigured()) return;
	const fields = await refundFields(payload, notice);
	await trigger("refund-initiated", notice.buyerId, {
		...fields,
		audience: "buyer",
		orderPath: `/purchases/${notice.orderId}`,
	});
	const shop = await findShop(payload, notice.shopId);
	if (!shop) return;
	await trigger("refund-initiated", relationId(shop.owner), {
		...fields,
		audience: "shop",
		orderPath: `/seller/orders/${notice.orderId}`,
	});
}

/** `refund-completed`: the buyer. */
export async function notifyRefundCompleted(
	payload: Payload,
	notice: RefundNoticeInput,
): Promise<void> {
	if (!isNotificationProviderConfigured()) return;
	await trigger(
		"refund-completed",
		notice.buyerId,
		await refundFields(payload, notice),
	);
}

/** `refund-failed`: the buyer, once the automatic retry has failed too. */
export async function notifyRefundFailed(
	payload: Payload,
	notice: RefundNoticeInput,
): Promise<void> {
	if (!isNotificationProviderConfigured()) return;
	await trigger(
		"refund-failed",
		notice.buyerId,
		await refundFields(payload, notice),
	);
}

/** Admins: a refund failed twice and an open `status_mismatch` awaits them. */
export async function notifyRefundStaffAlert(
	payload: Payload,
	notice: RefundNoticeInput & {
		mismatchId: string;
		failureReason: string | null;
	},
): Promise<void> {
	if (!isNotificationProviderConfigured()) return;
	await toAdmins(payload, "payments-refund-staff-alert", {
		refundId: notice.refundId,
		orderId: notice.orderId,
		shopId: notice.shopId,
		amount: notice.amount,
		currency: notice.currency,
		reason: notice.reason,
		mismatchId: notice.mismatchId,
		failureReason: notice.failureReason,
	});
}

/** The owner: a receivable was written off and protected payment suspended. */
export async function notifyReceivableWrittenOff(
	payload: Payload,
	notice: { shopId: string; amount: number; currency: string; holdId: string },
): Promise<void> {
	if (!isNotificationProviderConfigured()) return;
	const shop = await findShop(payload, notice.shopId);
	if (!shop) return;
	await trigger("payout-receivable-written-off", relationId(shop.owner), {
		shopId: notice.shopId,
		shopName: shop.name,
		amount: notice.amount,
		currency: notice.currency,
		holdId: notice.holdId,
	});
}

// --- Payout notices (Task 16) ---------------------------------------------
export interface PayoutNotice {
	payoutId: string;
	amount: number;
	currency: string;
}

/** `payout-sent`: the transfer reached the seller's payout account. */
export async function notifyPayoutSent(shop: ShopRef, notice: PayoutNotice) {
	await trigger("payout-sent", relationId(shop.owner), {
		shopId: String(shop.id),
		payoutId: notice.payoutId,
		amount: notice.amount,
		currency: notice.currency,
	});
}

/** `payout-failed`: the money is back in the connected account, retried at the next run. */
export async function notifyPayoutFailed(shop: ShopRef, notice: PayoutNotice) {
	await trigger("payout-failed", relationId(shop.owner), {
		shopId: String(shop.id),
		payoutId: notice.payoutId,
		amount: notice.amount,
		currency: notice.currency,
	});
}

export interface PayoutHoldPlacedNotice {
	holdId: string;
	scope: "shop" | "order";
	orderId: string | null;
	category: PayoutHoldCategory;
	/** Set when the owner can lift the cause themselves by fixing the payout account. */
	checkPayoutAccount: boolean;
}

/** `payout-hold-placed`, category only. */
export async function notifyPayoutHoldPlaced(
	shop: ShopRef,
	notice: PayoutHoldPlacedNotice,
) {
	await trigger("payout-hold-placed", relationId(shop.owner), {
		shopId: String(shop.id),
		shopName: String(shop.name ?? ""),
		holdId: notice.holdId,
		scope: notice.scope,
		orderId: notice.orderId,
		reasonCategory: notice.category,
		checkPayoutAccount: notice.checkPayoutAccount,
	});
}

// --- Checkout settlement notices (Task 14) --------------------------------
export interface PaymentNotice {
	orderId: string;
	orderNumber: string;
	intentId: string;
	buyerId: string | null;
	shopId: string | null;
	amount: number;
	currency: string;
}

const paymentFields = (notice: PaymentNotice) => ({
	orderId: notice.orderId,
	orderNumber: notice.orderNumber,
	amount: notice.amount,
	currency: notice.currency,
});

/** `payment-succeeded`: the buyer. */
export async function notifyPaymentSucceeded(
	_payload: Payload,
	notice: PaymentNotice,
): Promise<void> {
	await trigger("payment-succeeded", notice.buyerId, paymentFields(notice));
}

/** `order-paid`: the owner and managers, who now have until `acceptBy`. */
export async function notifyOrderPaid(
	payload: Payload,
	notice: PaymentNotice & { acceptBy: string },
): Promise<void> {
	if (!notice.shopId || !isNotificationProviderConfigured()) return;
	// Dynamic: the orders notification module registers P4's event handlers
	// on load, which a payment path must not do as a side effect.
	const { recipientsForShop } = await import("./orders/notifications");
	// `payments.view` is held by exactly the owner and managers.
	const recipients = await recipientsForShop(
		payload,
		notice.shopId,
		"payments.view",
	);
	for (const subscriberId of recipients) {
		await trigger("order-paid", subscriberId, {
			...paymentFields(notice),
			acceptBy: notice.acceptBy,
		});
	}
}

/** `payment-failed`: the buyer, on the final failure or the expiry only. */
export async function notifyPaymentFailed(
	_payload: Payload,
	notice: PaymentNotice & {
		status: "failed" | "expired";
		failureCode: string | null;
	},
): Promise<void> {
	await trigger("payment-failed", notice.buyerId, {
		...paymentFields(notice),
		status: notice.status,
		failureCode: notice.failureCode,
	});
}

// --- Reconciliation alert (Task 18's seam; Task 21 implements) -------------
export interface ReconciliationAlertNotice {
	runId: string;
	/** Every mismatch still `open` after the run, whichever run or service opened it. */
	openMismatches: number;
	/** Of those, the ones this run opened. */
	newMismatches: number;
	byKind: Partial<
		Record<
			| "missing_locally"
			| "missing_at_provider"
			| "amount_mismatch"
			| "status_mismatch"
			| "balance_mismatch"
			| "unbalanced_ledger",
			number
		>
	>;
}

/**
 * `payments-reconciliation-alert`: admins, by email, after a run that leaves
 * any mismatch open. The workflow's payload schema is strict (`runId`,
 * `openMismatches`, nothing else), so the richer notice stays here and the
 * breakdown lives on the staff route the email links to.
 */
export async function notifyReconciliationAlert(
	payload: Payload,
	notice: ReconciliationAlertNotice,
): Promise<void> {
	await toAdmins(payload, "payments-reconciliation-alert", {
		runId: notice.runId,
		openMismatches: notice.openMismatches,
	});
}
