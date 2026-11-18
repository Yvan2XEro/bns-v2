import { getConversationMeta } from "./cache.ts";
import { CHAT_SYSTEM_CHANNEL } from "./channels.ts";
import { getRoomId } from "./rooms.ts";

export { CHAT_SYSTEM_CHANNEL };

/** Mirrors `hooks/systemMessageEvents.ts` (API side) field for field;
 * `chat-channel-parity.int.spec.ts` pins the channel name, not this shape,
 * because the shape is only ever read on this side of the wire. */
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

/**
 * The only part of socket.io's `Server` this module consumes — same seam
 * style as `MembershipIO` in `membership.ts`.
 */
export interface SystemMessageIO {
	to(room: string): {
		emit(event: string, data: unknown): unknown;
	};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value !== "";
}

function parse(message: string): SystemMessagePublished | null {
	try {
		const data = JSON.parse(message) as Partial<SystemMessagePublished>;
		if (data.type !== "order.system_message") return null;
		if (!isNonEmptyString(data.conversationId)) return null;
		if (!isNonEmptyString(data.messageId)) return null;
		if (data.kind !== "system") return null;
		if (!isNonEmptyString(data.systemEvent)) return null;
		if (typeof data.content !== "string") return null;
		if (typeof data.createdAt !== "string") return null;
		return {
			type: "order.system_message",
			conversationId: data.conversationId,
			messageId: data.messageId,
			kind: "system",
			systemEvent: data.systemEvent,
			systemParams: isPlainObject(data.systemParams) ? data.systemParams : {},
			content: data.content,
			createdAt: data.createdAt,
		};
	} catch {
		return null;
	}
}

/**
 * Emits `message:new` to the conversation room and to each participant's own
 * `user:{id}` room, carrying `kind`/`systemEvent`/`systemParams` straight
 * from the Redis payload — ruling 2 in the P4 plan's Conflicts section: the
 * channel already carries everything a chip needs, so this makes no HTTP
 * call back to the API to "load" the message. `getConversationMeta` is a
 * cache read, not a fetch, for every participant who has ever joined the
 * conversation, which by the time an order posts a system message, both of
 * them have.
 */
export async function applySystemMessage(
	io: SystemMessageIO,
	message: SystemMessagePublished,
): Promise<void> {
	const payload = {
		id: message.messageId,
		conversationId: message.conversationId,
		sender: "",
		content: message.content,
		createdAt: message.createdAt,
		kind: message.kind,
		systemEvent: message.systemEvent,
		systemParams: message.systemParams,
	};

	io.to(getRoomId(message.conversationId)).emit("message:new", payload);

	const meta = await getConversationMeta(message.conversationId);
	for (const participantId of meta?.participants ?? []) {
		io.to(`user:${participantId}`).emit("message:new", payload);
	}
}

export async function startSystemMessageSubscriber(
	io: SystemMessageIO,
	subscriber: {
		subscribe(
			channel: string,
			handler: (message: string) => void,
		): Promise<unknown>;
	},
): Promise<void> {
	await subscriber.subscribe(CHAT_SYSTEM_CHANNEL, (raw) => {
		const message = parse(raw);
		if (!message) return;
		void applySystemMessage(io, message).catch((error) => {
			console.error(
				JSON.stringify({
					event: "systemMessage:apply:error",
					error: String(error),
					timestamp: new Date().toISOString(),
				}),
			);
		});
	});
}
