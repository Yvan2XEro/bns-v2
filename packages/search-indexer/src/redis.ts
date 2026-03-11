import { RedisClient } from "bun";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const CHANNEL = "search:index";

export type SearchEvent = {
	event: "listing.created" | "listing.updated" | "listing.deleted";
	listingId: string;
};

export function createSubscriber(
	onMessage: (event: SearchEvent) => Promise<void>,
): { start: () => Promise<void>; stop: () => Promise<void> } {
	const client = new RedisClient(REDIS_URL);

	const handleMessage = async (message: string, channel: string) => {
		if (channel !== CHANNEL) return;

		try {
			const event = JSON.parse(message) as SearchEvent;
			await onMessage(event);
		} catch (error) {
			console.error("[search-indexer] Failed to process message:", error);
		}
	};

	return {
		async start() {
			await client.subscribe(CHANNEL, handleMessage);
			console.log(`[search-indexer] Subscribed to channel: ${CHANNEL}`);
		},
		async stop() {
			await client.unsubscribe(CHANNEL);
			client.close();
			console.log("[search-indexer] Unsubscribed and disconnected");
		},
	};
}

export function createPublisher(): {
	publish: (event: SearchEvent) => Promise<void>;
	close: () => void;
} {
	const client = new RedisClient(REDIS_URL);

	return {
		async publish(event: SearchEvent) {
			await client.publish(CHANNEL, JSON.stringify(event));
		},
		close() {
			client.close();
		},
	};
}
