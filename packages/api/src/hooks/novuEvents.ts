import { getNovu } from "../services/novu";

interface TriggerPayload {
	event: string;
	subscriberId: string;
	payload: Record<string, string | number | boolean>;
}

export async function triggerNovuEvent({
	event,
	subscriberId,
	payload,
}: TriggerPayload): Promise<void> {
	try {
		const novu = getNovu();
		await novu.trigger(event, {
			to: { subscriberId },
			payload,
		});
	} catch (error) {
		console.error(`[novu] Failed to trigger event "${event}":`, error);
	}
}

export async function syncNovuSubscriber({
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
		const novu = getNovu();
		await novu.subscribers.identify(subscriberId, {
			email,
			firstName: name,
			avatar,
		});
	} catch (error) {
		console.error("[novu] Failed to sync subscriber:", error);
	}
}
