import { createClient, type RedisClientType } from "redis";
import { onCommit } from "../lib/transactions";

const CHANNEL = "search:index";
let publisher: RedisClientType | null = null;
let connecting = false;

export type ListingSearchEvent =
	| "listing.created"
	| "listing.updated"
	| "listing.deleted";
export type ShopSearchEvent = "shop.created" | "shop.updated" | "shop.deleted";
export type SearchEventName = ListingSearchEvent | ShopSearchEvent;

export interface ShopEventExtra {
	/** Name, handle, status or level changed: the shop's listing documents are stale. */
	reindexListings?: boolean;
}

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

export function buildSearchMessage(
	event: SearchEventName,
	id: string,
	extra: ShopEventExtra = {},
): Record<string, unknown> {
	return event.startsWith("shop.")
		? { event, shopId: id, ...extra }
		: { event, listingId: id };
}

export async function publishSearchEvent(
	event: SearchEventName,
	id: string,
	extra?: ShopEventExtra,
): Promise<void> {
	try {
		const client = await getPublisher();
		await client.publish(
			CHANNEL,
			JSON.stringify(buildSearchMessage(event, id, extra)),
		);
	} catch (error) {
		console.error("[searchEvents] Failed to publish event:", error);
	}
}

/** Publishes after commit when `req` is inside `withTransaction`, now otherwise. */
export async function queueSearchEvent(
	req: { context?: Record<string, unknown> } | undefined | null,
	event: SearchEventName,
	id: string,
	extra?: ShopEventExtra,
): Promise<void> {
	if (!process.env.REDIS_URL) return;
	if (onCommit(req, () => publishSearchEvent(event, id, extra))) return;
	await publishSearchEvent(event, id, extra);
}
