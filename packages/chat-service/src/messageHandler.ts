import type { Server, Socket } from "socket.io";
import { getParticipants } from "./cache.ts";
import { getRedis } from "./redis.ts";
import { getRoomId } from "./rooms.ts";
import { getServiceToken, invalidateServiceToken } from "./serviceAuth.ts";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 1;

type SendMessagePayload = {
	conversationId: string;
	content: string;
	tempId?: string;
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
	const count = await redis.incr(key);
	if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW);
	return count <= RATE_LIMIT_MAX;
}

async function persistMessage(
	conversationId: string,
	senderId: string,
	content: string,
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
		const { conversationId, content, tempId } = payload;

		if (!conversationId || !content?.trim()) {
			if (tempId)
				socket.emit("message:failed", {
					tempId,
					error: "Missing conversationId or content",
				});
			return;
		}

		const allowed = await checkRateLimit(userId);
		if (!allowed) {
			if (tempId)
				socket.emit("message:failed", { tempId, error: "Rate limit exceeded" });
			return;
		}

		// Fetch participants from cache (no HTTP if cached) for broadcast
		const participants = await getParticipants(conversationId);

		// Persist async — no blocking broadcast
		persistMessage(conversationId, userId, content.trim())
			.then((message) => {
				const msgPayload = {
					id: message.id,
					conversationId,
					sender: userId,
					content: message.content,
					createdAt: message.createdAt,
					...(tempId ? { tempId } : {}),
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

			// Mark messages as read via service token (fire-and-forget)
			getServiceToken()
				.then((token) =>
					Promise.all(
						payload.messageIds.map((messageId) =>
							fetch(`${PAYLOAD_API_URL}/messages/${messageId}`, {
								method: "PATCH",
								headers: {
									"Content-Type": "application/json",
									Authorization: `JWT ${token}`,
								},
								body: JSON.stringify({ read: true }),
							}),
						),
					),
				)
				.catch((err) =>
					console.error("[chat] Failed to mark messages as read:", err),
				);
		},
	);
}
