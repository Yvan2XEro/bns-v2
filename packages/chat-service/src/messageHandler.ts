import type { Server, Socket } from "socket.io";
import {
	getConversationMeta,
	hasConversationAccess,
	invalidateConversationMeta,
} from "./cache.ts";
import { getRedis } from "./redis.ts";
import { getRoomId, shopInboxRoom } from "./rooms.ts";
import { getServiceToken, invalidateServiceToken } from "./serviceAuth.ts";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 1;
const RATE_LIMIT_SCRIPT =
	"local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count";

type SendMessagePayload = {
	conversationId: string;
	content: string;
	tempId?: string;
	listing?: string;
};

type ListingAttachment = {
	id: string;
	title: string;
	price?: number;
	thumbnailUrl?: string;
};

type MessageResponse = {
	id: string;
	conversation: string;
	sender: string;
	content: string;
	createdAt: string;
};

async function checkRateLimit(userId: string): Promise<boolean> {
	const redis = getRedis();
	const key = `ratelimit:msg:${userId}`;
	const result: unknown = await redis.send("EVAL", [
		RATE_LIMIT_SCRIPT,
		"1",
		key,
		String(RATE_LIMIT_WINDOW),
	]);
	if (typeof result !== "number")
		throw new Error("Redis returned an invalid message rate limit counter");
	const count = result;
	return count <= RATE_LIMIT_MAX;
}

async function fetchListingAttachment(
	listingId: string,
	token: string,
): Promise<ListingAttachment | undefined> {
	try {
		const res = await fetch(
			`${PAYLOAD_API_URL}/listings/${listingId}?depth=1`,
			{
				headers: { Authorization: `JWT ${token}` },
			},
		);
		if (!res.ok) return undefined;
		const data = (await res.json()) as {
			doc?: {
				id: string;
				title: string;
				price?: number;
				images?: Array<{ image?: { url?: string } }>;
			};
			id?: string;
			title?: string;
			price?: number;
			images?: Array<{ image?: { url?: string } }>;
		};
		const l = data.doc ?? data;
		return {
			id: String(l.id),
			title: String(l.title ?? ""),
			price: l.price,
			thumbnailUrl: l.images?.[0]?.image?.url,
		};
	} catch {
		return undefined;
	}
}

async function persistMessage(
	conversationId: string,
	senderId: string,
	content: string,
	listingId?: string,
): Promise<MessageResponse> {
	const token = await getServiceToken();
	const response = await fetch(`${PAYLOAD_API_URL}/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `JWT ${token}`,
		},
		body: JSON.stringify({
			conversation: conversationId,
			sender: senderId,
			content,
			...(listingId ? { listing: listingId } : {}),
		}),
	});

	if (!response.ok) {
		if (response.status === 401) invalidateServiceToken();
		const error = await response.text();
		throw new Error(`Failed to persist message: ${response.status} ${error}`);
	}

	const data = (await response.json()) as { doc: MessageResponse };
	return data.doc;
}

export function registerMessageHandlers(
	io: Server,
	socket: Socket,
	userId: string,
): void {
	socket.on("message:send", async (payload: SendMessagePayload) => {
		const { conversationId, content, tempId, listing: listingId } = payload;

		if (!conversationId || !content?.trim()) {
			if (tempId)
				socket.emit("message:failed", {
					tempId,
					error: "Missing conversationId or content",
				});
			return;
		}

		// Before the rate limit: a refused send must not consume a caller's
		// budget, and `conversation:join` was never the only way in — a client
		// can emit `message:send` for any id it can guess.
		if (!(await hasConversationAccess(userId, conversationId))) {
			if (tempId)
				socket.emit("message:failed", {
					tempId,
					error: "Access denied to conversation",
				});
			return;
		}

		const allowed = await checkRateLimit(userId);
		if (!allowed) {
			if (tempId)
				socket.emit("message:failed", { tempId, error: "Rate limit exceeded" });
			return;
		}

		// Fetch meta from cache (no HTTP if cached) for broadcast
		const meta = await getConversationMeta(conversationId);
		const participants = meta?.participants ?? [];
		const shopId = meta?.shopId ?? null;

		// Persist async — no blocking broadcast
		persistMessage(conversationId, userId, content.trim(), listingId)
			.then(async (message) => {
				// Fetch listing data to include in broadcast (only if listing attached)
				let listing: ListingAttachment | undefined;
				if (listingId) {
					const token = await getServiceToken();
					listing = await fetchListingAttachment(listingId, token);
				}

				const msgPayload = {
					id: message.id,
					conversationId,
					sender: userId,
					content: message.content,
					createdAt: message.createdAt,
					...(tempId ? { tempId } : {}),
					...(listing ? { listing } : {}),
				};

				// Broadcast to conversation room
				const roomId = getRoomId(conversationId);
				io.to(roomId).emit("message:new", msgPayload);

				// Also notify participants via personal rooms (for new conversations)
				for (const participantId of participants) {
					if (participantId !== userId) {
						io.to(`user:${participantId}`).emit("message:new", msgPayload);
					}
				}

				// Confirm to sender with real message id
				if (tempId) {
					socket.emit("message:confirmed", { tempId, message: msgPayload });
				}

				// Update conversation lastMessage (fire-and-forget)
				getServiceToken()
					.then((token) =>
						fetch(`${PAYLOAD_API_URL}/conversations/${conversationId}`, {
							method: "PATCH",
							headers: {
								"Content-Type": "application/json",
								Authorization: `JWT ${token}`,
							},
							body: JSON.stringify({ lastMessage: message.id }),
						}),
					)
					.catch((err) =>
						console.error("[chat] Failed to update lastMessage:", err),
					);

				if (shopId) {
					io.to(shopInboxRoom(shopId)).emit("message:new", {
						...msgPayload,
						shopId,
					});
					// The API's `Messages.afterChange` has already written
					// `inboxStatus`, `awaitingReply` and `lastMessageAt`; the cache
					// entry for the conversation is meta only, so this is one read.
					await invalidateConversationMeta(conversationId);
					const token = await getServiceToken();
					const res = await fetch(
						`${PAYLOAD_API_URL}/conversations/${conversationId}?depth=0`,
						{ headers: { Authorization: `JWT ${token}` } },
					);
					if (res.ok) {
						const conv = (await res.json()) as {
							assignee?: unknown;
							inboxStatus?: string;
							awaitingReply?: boolean;
							lastMessageAt?: string | null;
						};
						io.to(shopInboxRoom(shopId)).emit("inbox:conversation-updated", {
							conversationId,
							assignee:
								conv.assignee &&
								typeof conv.assignee === "object" &&
								"id" in conv.assignee
									? String((conv.assignee as { id: unknown }).id)
									: ((conv.assignee as string | null | undefined) ?? null),
							inboxStatus: (conv.inboxStatus ?? "open") as "open" | "done",
							awaitingReply: conv.awaitingReply === true,
							lastMessageAt: conv.lastMessageAt ?? null,
						});
					}
				}

				console.log(
					JSON.stringify({
						event: "message:send",
						userId,
						conversationId,
						messageId: message.id,
						timestamp: new Date().toISOString(),
					}),
				);
			})
			.catch((error) => {
				console.error(
					JSON.stringify({
						event: "message:send:error",
						userId,
						conversationId,
						error: String(error),
						timestamp: new Date().toISOString(),
					}),
				);
				if (tempId) {
					socket.emit("message:failed", {
						tempId,
						error: "Failed to send message",
					});
				}
			});
	});

	socket.on(
		"message:delivered",
		(payload: { conversationId: string; messageId: string }) => {
			const roomId = getRoomId(payload.conversationId);
			socket.to(roomId).emit("message:delivered", {
				messageId: payload.messageId,
				userId,
			});
		},
	);

	socket.on(
		"message:read",
		(payload: { conversationId: string; messageIds: string[] }) => {
			const roomId = getRoomId(payload.conversationId);
			socket.to(roomId).emit("message:read", {
				messageIds: payload.messageIds,
				userId,
			});

			const lastMessageId = payload.messageIds[payload.messageIds.length - 1];
			if (!lastMessageId) return;

			// One call to the read route instead of N PATCHes: it also upserts
			// the caller's `conversation-reads` row, which per-message PATCHes
			// never did — that is what the shared inbox counts unread from.
			getServiceToken()
				.then((token) =>
					fetch(
						`${PAYLOAD_API_URL}/conversations/${payload.conversationId}/read`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `JWT ${token}`,
							},
							body: JSON.stringify({ lastMessageId, userId }),
						},
					),
				)
				.catch((err) =>
					console.error("[chat] Failed to mark the conversation read:", err),
				);
		},
	);
}
