import type { Payload } from "payload";
import type { PayoutMethod } from "../collections/PayoutAccounts";
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
