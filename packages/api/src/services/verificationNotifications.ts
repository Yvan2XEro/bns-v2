import type { PayloadRequest } from "payload";
import { triggerNotificationEvent } from "../hooks/notificationEvents";
import { commitContextOf, onCommit } from "../lib/transactions";

type NotificationValue = string | number | boolean | null | undefined;
type NotificationPayload = Record<string, NotificationValue>;

/**
 * Every trigger goes through `onCommit`: a decision that rolls back — the
 * transaction's body threw after this ran — must never have told the seller
 * it happened. `commitContextOf` narrows `req` to what `onCommit` needs
 * without widening `onCommit`'s own parameter to a shape `withTransaction`
 * never actually produces (see its own comment).
 */
function queue(
	req: PayloadRequest,
	event: string,
	subscriberId: string,
	payload: NotificationPayload,
): void {
	onCommit(commitContextOf(req), () =>
		triggerNotificationEvent({ event, subscriberId, payload }),
	);
}

export async function notifyVerificationNeedsInfo(
	req: PayloadRequest,
	input: {
		subscriberId: string;
		shopName: string;
		reasonCode: string;
		message: string;
	},
): Promise<void> {
	queue(req, "verification-needs-info", input.subscriberId, {
		shopName: input.shopName,
		reasonCode: input.reasonCode,
		message: input.message,
	});
}

export async function notifyVerificationApproved(
	req: PayloadRequest,
	input: {
		subscriberId: string;
		shopName: string;
		level: 2 | 3;
		unlocks: string[];
	},
): Promise<void> {
	queue(req, "verification-approved", input.subscriberId, {
		shopName: input.shopName,
		level: input.level,
		unlocks: input.unlocks.join(", "),
	});
}

export async function notifyVerificationRejected(
	req: PayloadRequest,
	input: {
		subscriberId: string;
		shopName: string;
		reasonCode: string;
		sellerMessage: string;
		cooldownUntil: string | null;
	},
): Promise<void> {
	queue(req, "verification-rejected", input.subscriberId, {
		shopName: input.shopName,
		reasonCode: input.reasonCode,
		sellerMessage: input.sellerMessage,
		cooldownUntil: input.cooldownUntil,
	});
}

export async function notifyVerificationRevoked(
	req: PayloadRequest,
	input: { subscriberId: string; shopName: string; reasonCode: string },
): Promise<void> {
	queue(req, "verification-revoked", input.subscriberId, {
		shopName: input.shopName,
		reasonCode: input.reasonCode,
	});
}

export async function notifyVerificationExpiring(
	req: PayloadRequest,
	input: { subscriberId: string; shopName: string; daysUntil: number },
): Promise<void> {
	queue(req, "verification-expiring", input.subscriberId, {
		shopName: input.shopName,
		daysUntil: input.daysUntil,
	});
}
