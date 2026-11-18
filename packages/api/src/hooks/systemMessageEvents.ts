import { createClient, type RedisClientType } from "redis";
import { onCommit } from "../lib/transactions";

export const CHAT_SYSTEM_CHANNEL = "chat:system";

/**
 * Carries the message itself, not a reference to it: chat-service has no
 * authenticated path to read a private message (`Messages.access.read`
 * widens to participants and shop inbox members, and the service account is
 * neither), so the channel has to hand over everything a chip needs to
 * render — `chat-channel-parity.int.spec.ts` and `systemMessages.test.ts`
 * both pin this shape.
 */
export interface SystemMessagePublished {
	type: "order.system_message";
	conversationId: string;
	messageId: string;
	kind: "system";
	systemEvent: string;
	systemParams: Record<string, unknown>;
	content: string;
	createdAt: string;
}

type Publish = (channel: string, message: string) => Promise<void>;

let publisher: RedisClientType | null = null;
let connecting = false;
let injected: Publish | null = null;

/** Test seam: the publisher is a module singleton with a live socket. */
export function __setSystemMessagePublisherForTests(
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
			console.error("[systemMessageEvents] Redis error:", err);
		});
		await publisher.connect();
		connecting = false;
	}
	const client = publisher;
	return async (channel, message) => {
		await client.publish(channel, message);
	};
}

export async function publishSystemMessage(
	message: SystemMessagePublished,
): Promise<void> {
	try {
		const publish = await getPublish();
		await publish(CHAT_SYSTEM_CHANNEL, JSON.stringify(message));
	} catch (error) {
		// A message already committed must not fail because Redis is down: the
		// thread still has the line, only the live push is missed, and the
		// next poll or reconnect picks it up.
		console.error("[systemMessageEvents] Failed to publish event:", error);
	}
}

/**
 * Publishes after commit when `req` came from `withTransaction`, now
 * otherwise — same reasoning as `queueSearchEvent`/`queueMembershipChange`:
 * a system message announced for a transition that then rolls back is a
 * thread claiming something that did not happen.
 */
export async function queueSystemMessage(
	req: { context?: Record<string, unknown> } | undefined | null,
	payload: SystemMessagePublished,
): Promise<void> {
	if (!process.env.REDIS_URL) return;
	if (onCommit(req, () => publishSystemMessage(payload))) return;
	await publishSystemMessage(payload);
}
