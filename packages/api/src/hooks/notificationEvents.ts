import type { Overrides } from "@novu/api/models/components";
import { ChatOrPushProviderEnum } from "@novu/api/models/components";
import { getNotificationProvider } from "../services/notificationProvider";

type NotificationPayloadValue = string | number | boolean | null | undefined;

type NotificationPayload = Record<string, NotificationPayloadValue>;

interface TriggerPayload {
	event: string;
	subscriberId: string;
	payload: NotificationPayload;
	overrides?: Overrides;
	/**
	 * An address to reach when the recipient is not a subscriber yet — an
	 * invitee with no account. Novu accepts an inline subscriber object in
	 * place of an id, which creates it on the fly.
	 */
	email?: string;
}

function getStringValue(
	payload: NotificationPayload,
	key: string,
): string | undefined {
	const value = payload[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function buildExpoPushData(
	event: string,
	payload: NotificationPayload,
): Record<string, string> | undefined {
	const listingId = getStringValue(payload, "listingId");
	const conversationId = getStringValue(payload, "conversationId");
	const searchUrl = getStringValue(payload, "searchUrl");
	const productId = getStringValue(payload, "productId");
	const shopId = getStringValue(payload, "shopId");
	const orderId = getStringValue(payload, "orderId");
	const invoiceId = getStringValue(payload, "invoiceId");

	switch (event) {
		// `order-placed` and `order-delivered` reach both the buyer and shop
		// members from the same workflow id; `audience` (present on both
		// payloads) is the only signal this function has to tell them apart.
		// The shop-only reminders (`order-confirmation-needed`,
		// `order-accept-reminder`, `order-stale-reminder`) have one audience and
		// need no such field.
		// The other mixed-recipient order workflows (`order-cancelled`,
		// `order-delivery-failed`, `order-withdrawal-requested`) carry no such
		// field per the spec table, so they fall back to the buyer's screen —
		// the one route every recipient of those three can at least open.
		case "order-placed":
		case "order-delivered": {
			if (!orderId) return undefined;
			const audience = getStringValue(payload, "audience");
			return audience === "shop"
				? { orderId, url: `/seller/orders/${orderId}` }
				: { orderId, url: `/purchases/${orderId}` };
		}
		case "order-confirmation-needed":
		case "order-accept-reminder":
		case "order-stale-reminder":
			return orderId
				? { orderId, url: `/seller/orders/${orderId}` }
				: undefined;
		case "order-accepted":
		case "order-shipped":
		case "order-delivery-declared":
		case "order-review-reminder":
		case "order-cancelled":
		case "order-delivery-failed":
		case "order-withdrawal-requested":
			return orderId ? { orderId, url: `/purchases/${orderId}` } : undefined;
		case "commission-invoice-issued":
		case "commission-invoice-overdue":
		case "commission-invoice-paid":
			return invoiceId
				? { invoiceId, url: `/seller/billing/${invoiceId}` }
				: undefined;
		// P5. The spec's "payments to /orders/{id}" names no client route: the
		// buyer's order lives at /purchases/{id} and the shop's at
		// /seller/orders/{id}, so each audience gets its own.
		case "payment-succeeded":
		case "payment-failed":
		case "refund-completed":
		case "refund-failed":
			return orderId ? { orderId, url: `/purchases/${orderId}` } : undefined;
		case "order-paid":
			return orderId
				? { orderId, url: `/seller/orders/${orderId}` }
				: undefined;
		case "refund-initiated": {
			if (!orderId) return undefined;
			return getStringValue(payload, "audience") === "shop"
				? { orderId, url: `/seller/orders/${orderId}` }
				: { orderId, url: `/purchases/${orderId}` };
		}
		case "payout-sent":
		case "payout-failed":
		case "payout-hold-placed":
		case "payout-hold-released":
		case "payout-receivable-written-off":
			return { url: "/seller/payments" };
		case "payments-onboarding-action":
		case "payout-account-activated":
		case "payout-account-review":
		case "payout-account-changed":
			return { url: "/seller/payments/setup" };
		case "listing-approved":
		case "listing-status":
		case "listing-expired":
			return listingId
				? { listingId, url: `/listing/${listingId}` }
				: undefined;
		case "listing-rejected":
			return listingId
				? {
						listingId,
						url: `/listing/${listingId}/edit`,
					}
				: undefined;
		case "boost-expired":
			// Deliberately points at the listing, not at /boost/: routing a push
			// notification to a purchase flow that ends in an external checkout is
			// an App Review 3.1.1 link-out.
			return listingId
				? { listingId, url: `/listing/${listingId}` }
				: undefined;
		case "new-message":
			return conversationId
				? {
						conversationId,
						url: `/messages/${conversationId}`,
					}
				: undefined;
		case "search-alert":
			return searchUrl ? { url: searchUrl } : undefined;
		case "shop-created":
		case "shop-suspended":
		case "shop-unsuspended":
			return { url: "/seller" };
		case "stock-low":
			return productId
				? { productId, url: `/seller/product/${productId}` }
				: undefined;
		case "shop-inbox-message":
		case "shop-conversation-assigned": {
			if (!conversationId || !shopId) return undefined;
			return { conversationId, shopId, url: `/seller/inbox/${conversationId}` };
		}
		case "shop-invitation-accepted":
		case "shop-invitation-declined":
		case "shop-member-role-changed":
		case "shop-team-paused":
			return { url: "/seller/team" };
		case "shop-member-removed":
			// Not `/seller`: they can no longer open that shop, and a push that
			// lands on a permission error is worse than one that lands on a list.
			return { url: "/account" };
		case "shop-invitation": {
			const inviteUrl = getStringValue(payload, "inviteUrl");
			const token = inviteUrl?.split("/invite/")[1];
			return token ? { url: `/invite/${token}` } : undefined;
		}
		default:
			return undefined;
	}
}

function mergeOverrides(
	event: string,
	payload: NotificationPayload,
	overrides?: Overrides,
): Overrides | undefined {
	const expoData = buildExpoPushData(event, payload);
	if (!expoData && !overrides) {
		return undefined;
	}

	return {
		...overrides,
		providers: {
			...(overrides?.providers ?? {}),
			expo: {
				sound: "default",
				priority: "high",
				channelId: "default",
				...(overrides?.providers?.expo ?? {}),
				...(expoData ? { data: expoData } : {}),
			},
		},
	};
}

export async function triggerNotificationEvent({
	event,
	subscriberId,
	payload,
	overrides,
	email,
}: TriggerPayload): Promise<void> {
	try {
		const notificationProvider = getNotificationProvider();
		await notificationProvider.trigger({
			workflowId: event,
			to: email ? { subscriberId, email } : subscriberId,
			payload,
			overrides: mergeOverrides(event, payload, overrides),
		});
	} catch (error) {
		console.error(`[notifications] Failed to trigger event "${event}":`, error);
	}
}

/**
 * Whether `subscriberId` has a working Expo push credential on Novu. The SDK
 * exposes no way to ask this cheaply — credentials are write-only
 * (`subscribers.credentials.update`/`append`/`delete`) — so this reads the
 * subscriber back and inspects the one channel entry Expo would have written.
 * Used only to decide the order-placed seller SMS fallback (`services/orders/
 * notifications.ts`): a lookup failure must read as "no token", the same as
 * a subscriber who genuinely never registered one, never as a reason to
 * throw and lose the order notification entirely.
 */
export async function hasPushCredential(
	subscriberId: string,
): Promise<boolean> {
	try {
		const notificationProvider = getNotificationProvider();
		const { result } =
			await notificationProvider.subscribers.retrieve(subscriberId);
		return (result.channels ?? []).some(
			(channel) =>
				channel.providerId === ChatOrPushProviderEnum.Expo &&
				(channel.credentials.deviceTokens?.length ?? 0) > 0,
		);
	} catch (error) {
		console.error(
			`[notifications] Failed to read push credentials for "${subscriberId}":`,
			error,
		);
		return false;
	}
}

export async function syncNotificationSubscriber({
	subscriberId,
	email,
	name,
	avatar,
}: {
	subscriberId: string;
	email: string;
	name: string;
	avatar?: string;
}): Promise<void> {
	try {
		const notificationProvider = getNotificationProvider();
		await notificationProvider.subscribers.create({
			subscriberId,
			email,
			firstName: name,
			avatar,
		});
	} catch (error) {
		console.error("[notifications] Failed to sync subscriber:", error);
	}
}
