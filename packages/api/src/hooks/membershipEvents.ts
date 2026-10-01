import { createClient, type RedisClientType } from "redis";
import { onCommit } from "../lib/transactions";

export const CHAT_MEMBERSHIP_CHANNEL = "chat:membership";

export interface MembershipChangeMessage {
	type: "shop.members.changed";
	shopId: string;
	/** Empty means "the set changed, refetch it and evict whoever is no longer in it". */
	removedUserIds: string[];
}

type Publish = (channel: string, message: string) => Promise<void>;

let publisher: RedisClientType | null = null;
let connecting = false;
let injected: Publish | null = null;

/** Test seam: the publisher is a module singleton with a live socket. */
export function __setMembershipPublisherForTests(
	publish: Publish | null,
): void {
	injected = publish;
}

async function getPublish(): Promise<Publish> {
	if (injected) return injected;

	if (publisher?.isOpen) {
		const client = publisher;
		return async (channel, message) => {
			await client.publish(channel, message);
		};
	}

	if (connecting) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	if (!publisher?.isOpen) {
		connecting = true;
		const url = process.env.REDIS_URL || "redis://localhost:6379";
		publisher = createClient({ url }) as RedisClientType;
		publisher.on("error", (err) => {
			console.error("[membershipEvents] Redis error:", err);
		});
		await publisher.connect();
		connecting = false;
	}
	const client = publisher;
	return async (channel, message) => {
		await client.publish(channel, message);
	};
}

export function buildMembershipMessage(
	shopId: string,
	removedUserIds: string[] = [],
): MembershipChangeMessage {
	return { type: "shop.members.changed", shopId, removedUserIds };
}

export async function publishMembershipChange(
	shopId: string,
	removedUserIds: string[] = [],
): Promise<void> {
	try {
		const publish = await getPublish();
		await publish(
			CHAT_MEMBERSHIP_CHANNEL,
			JSON.stringify(buildMembershipMessage(shopId, removedUserIds)),
		);
	} catch (error) {
		// A removal that has already committed must not fail because Redis is
		// down. chat-service's membership cache expires on its own, so the
		// worst case is a removed member keeping a live socket a little longer;
		// failing the caller instead would mean rejecting a membership change
		// that the database has already made durable.
		console.error("[membershipEvents] Failed to publish event:", error);
	}
}

/**
 * Publishes after commit when `req` came from `withTransaction`, now
 * otherwise. Same reasoning as `queueSearchEvent`: publishing before the
 * commit would let chat-service refetch the membership set and read the
 * pre-commit state, re-caching exactly the access the change was removing.
 */
export async function queueMembershipChange(
	req: { context?: Record<string, unknown> } | undefined | null,
	shopId: string,
	removedUserIds: string[] = [],
): Promise<void> {
	if (!process.env.REDIS_URL) return;
	if (onCommit(req, () => publishMembershipChange(shopId, removedUserIds))) {
		return;
	}
	await publishMembershipChange(shopId, removedUserIds);
}
