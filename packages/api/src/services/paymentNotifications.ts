import type { Payload } from "payload";
import type { PayoutMethod } from "../collections/PayoutAccounts";
import type { ConnectedAccountStatus } from "../lib/payments/marketplace";
import { relationId } from "../lib/relationId";
import type { Shop } from "../payload-types";
import { isNotificationProviderConfigured } from "./notificationProvider";

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

export interface PayoutHoldNotice {
	holdId: string;
	scope: "shop" | "order";
	orderId: string | null;
	/** The category, never the reason: the owner must not learn the fraud rule. */
	category: "security" | "review" | "operations";
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
		category: notice.category,
		cause: notice.cause,
	});
}

// --- Payout-account notices (Task 10's seam; Task 21 implements) ---------
export interface PayoutAccountNotice {
	shopId: string;
	ownerId: string;
	accountId: string;
	method: PayoutMethod;
	accountNumberMasked: string;
}

export interface PayoutAccountChangedNotice extends PayoutAccountNotice {
	holdUntil: string;
	notMeUrl: string;
}

const pending = (name: string) =>
	new Error(`services/paymentNotifications.${name} lands with P5 Task 21`);

export async function notifyPayoutAccountActivated(
	_payload: Payload,
	_notice: PayoutAccountNotice,
): Promise<void> {
	throw pending("notifyPayoutAccountActivated");
}

export async function notifyPayoutAccountReview(
	_payload: Payload,
	_notice: PayoutAccountNotice & { result: "partial" | "mismatch" },
): Promise<void> {
	throw pending("notifyPayoutAccountReview");
}

/** `payout-account-changed`: push, email and SMS, carrying the not-me link. */
export async function notifyPayoutAccountChanged(
	_payload: Payload,
	_notice: PayoutAccountChangedNotice,
): Promise<void> {
	throw pending("notifyPayoutAccountChanged");
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
	const shop = await payload
		.findByID({
			collection: "shops",
			id: input.shopId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!shop) return;
	await trigger("payout-hold-placed", relationId(shop.owner), {
		shopId: input.shopId,
		shopName: shop.name,
		reasonCategory: "security",
	});
	const { docs: admins } = await payload.find({
		collection: "users",
		where: { role: { equals: "admin" } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	for (const admin of admins) {
		await trigger("payments-connected-account-lost", String(admin.id), {
			shopId: input.shopId,
			shopName: shop.name,
			status: input.status,
		});
	}
}

// --- Refund notices (Task 15's seam; Task 21 implements) -------------------
export interface RefundNoticeInput {
	refundId: string;
	orderId: string;
	buyerId: string | null;
	shopId: string | null;
	amount: number;
	currency: string;
	reason: string;
}

/** `refund-initiated`: the buyer, and the owner. */
export async function notifyRefundInitiated(
	_payload: Payload,
	_notice: RefundNoticeInput,
): Promise<void> {
	throw pending("notifyRefundInitiated");
}

/** `refund-completed`: the buyer. */
export async function notifyRefundCompleted(
	_payload: Payload,
	_notice: RefundNoticeInput,
): Promise<void> {
	throw pending("notifyRefundCompleted");
}

/** `refund-failed`: the buyer, once the automatic retry has failed too. */
export async function notifyRefundFailed(
	_payload: Payload,
	_notice: RefundNoticeInput,
): Promise<void> {
	throw pending("notifyRefundFailed");
}

/** Admins: a refund failed twice and an open `status_mismatch` awaits them. */
export async function notifyRefundStaffAlert(
	_payload: Payload,
	_notice: RefundNoticeInput & {
		mismatchId: string;
		failureReason: string | null;
	},
): Promise<void> {
	throw pending("notifyRefundStaffAlert");
}

/** The owner: a receivable was written off and protected payment suspended. */
export async function notifyReceivableWrittenOff(
	_payload: Payload,
	_notice: { shopId: string; amount: number; currency: string; holdId: string },
): Promise<void> {
	throw pending("notifyReceivableWrittenOff");
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
	category: "security" | "review" | "operations";
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
