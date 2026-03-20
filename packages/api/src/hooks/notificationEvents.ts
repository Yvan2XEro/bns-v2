import { getNotificationProvider } from "../services/notificationProvider";

interface TriggerPayload {
	event: string;
	subscriberId: string;
	payload: Record<string, string | number | boolean>;
}

export async function triggerNotificationEvent({
	event,
	subscriberId,
	payload,
}: TriggerPayload): Promise<void> {
	try {
		const notificationProvider = getNotificationProvider();
		await notificationProvider.trigger({
			workflowId: event,
			to: subscriberId,
			payload,
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
