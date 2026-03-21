import type { Overrides } from "@novu/api/models/components";
import { getNotificationProvider } from "../services/notificationProvider";

type NotificationPayloadValue = string | number | boolean | null | undefined;

type NotificationPayload = Record<string, NotificationPayloadValue>;

interface TriggerPayload {
	event: string;
	subscriberId: string;
	payload: NotificationPayload;
	overrides?: Overrides;
}

function getStringValue(
	payload: NotificationPayload,
	key: string,
): string | undefined {
	const value = payload[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildExpoPushData(
	event: string,
	payload: NotificationPayload,
): Record<string, string> | undefined {
	const listingId = getStringValue(payload, "listingId");
	const conversationId = getStringValue(payload, "conversationId");
	const searchUrl = getStringValue(payload, "searchUrl");

	switch (event) {
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
			return listingId ? { listingId, url: `/boost/${listingId}` } : undefined;
		case "new-message":
			return conversationId
				? {
						conversationId,
						url: `/messages/${conversationId}`,
					}
				: undefined;
		case "search-alert":
			return searchUrl ? { url: searchUrl } : undefined;
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
}: TriggerPayload): Promise<void> {
	try {
		const notificationProvider = getNotificationProvider();
		await notificationProvider.trigger({
			workflowId: event,
			to: subscriberId,
			payload,
			overrides: mergeOverrides(event, payload, overrides),
		});
	} catch (error) {
		console.error(`[notifications] Failed to trigger event "${event}":`, error);
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
