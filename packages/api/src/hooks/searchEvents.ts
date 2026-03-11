import { createClient, type RedisClientType } from "redis";

const CHANNEL = "search:index";
let publisher: RedisClientType | null = null;
let connecting = false;

async function getPublisher(): Promise<RedisClientType> {
	if (publisher?.isOpen) return publisher;

	if (connecting) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		if (publisher?.isOpen) return publisher;
	}

	connecting = true;
	const url = process.env.REDIS_URL || "redis://localhost:6379";
	publisher = createClient({ url }) as RedisClientType;

	publisher.on("error", (err) => {
		console.error("[searchEvents] Redis error:", err);
	});

	await publisher.connect();
	connecting = false;
	return publisher;
}

export async function publishSearchEvent(
	event: "listing.created" | "listing.updated" | "listing.deleted",
	listingId: string,
): Promise<void> {
	try {
		const client = await getPublisher();
		await client.publish(
			CHANNEL,
			JSON.stringify({ event, listingId }),
		);
	} catch (error) {
		console.error("[searchEvents] Failed to publish event:", error);
	}
}
