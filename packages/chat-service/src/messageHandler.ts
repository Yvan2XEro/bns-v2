import type { Server, Socket } from "socket.io";
import { getRedis } from "./redis.ts";
import { getRoomId } from "./rooms.ts";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 1;

type SendMessagePayload = {
	conversationId: string;
	content: string;
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

	if (count === 1) {
		await redis.expire(key, RATE_LIMIT_WINDOW);
	}

	return count <= RATE_LIMIT_MAX;
}

async function persistMessage(
	conversationId: string,
	senderId: string,
	content: string,
	token: string,
): Promise<MessageResponse> {
	const response = await fetch(`${PAYLOAD_API_URL}/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `JWT ${token}`,
		},
		body: JSON.stringify({
			conversation: Number(conversationId),
			sender: Number(senderId),
			content,
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to persist message: ${response.status} ${error}`);
	}

	const message = (await response.json()) as { doc: MessageResponse };
	return message.doc;
}

async function updateConversationLastMessage(
	conversationId: string,
	messageId: string,
	token: string,
): Promise<void> {
	await fetch(`${PAYLOAD_API_URL}/conversations/${conversationId}`, {
		method: "PATCH",
		headers: {
			"Content-Type": "application/json",
			Authorization: `JWT ${token}`,
		},
		body: JSON.stringify({ lastMessage: Number(messageId) }),
	});
}

async function markMessageRead(
	messageId: string,
	token: string,
): Promise<void> {
	await fetch(`${PAYLOAD_API_URL}/messages/${messageId}`, {
		method: "PATCH",
		headers: {
			"Content-Type": "application/json",
			Authorization: `JWT ${token}`,
		},
		body: JSON.stringify({ read: true }),
	});
}

export function registerMessageHandlers(
	io: Server,
	socket: Socket,
	userId: string,
	token: string,
): void {
	socket.on(
		"message:send",
		async (
			payload: SendMessagePayload,
			ack?: (response: {
				success: boolean;
				message?: MessageResponse;
				error?: string;
			}) => void,
		) => {
			const { conversationId, content } = payload;

			if (!conversationId || !content?.trim()) {
				ack?.({ success: false, error: "Missing conversationId or content" });
				return;
			}

			const allowed = await checkRateLimit(userId);
			if (!allowed) {
				ack?.({ success: false, error: "Rate limit exceeded" });
				return;
			}

			try {
				const message = await persistMessage(
					conversationId,
					userId,
					content.trim(),
					token,
				);

				updateConversationLastMessage(conversationId, message.id, token).catch(
					(err) => console.error("[chat] Failed to update lastMessage:", err),
				);

				const roomId = getRoomId(conversationId);
				io.to(roomId).emit("message:new", {
					id: message.id,
					conversationId,
					sender: userId,
					content: message.content,
					createdAt: message.createdAt,
				});

				ack?.({ success: true, message });

				console.log(
					JSON.stringify({
						event: "message:send",
						userId,
						conversationId,
						messageId: message.id,
						timestamp: new Date().toISOString(),
					}),
				);
			} catch (error) {
				console.error(
					JSON.stringify({
						event: "message:send:error",
						userId,
						conversationId,
						error: String(error),
						timestamp: new Date().toISOString(),
					}),
				);
				ack?.({ success: false, error: "Failed to send message" });
			}
		},
	);

	socket.on(
		"message:delivered",
		async (payload: { conversationId: string; messageId: string }) => {
			const roomId = getRoomId(payload.conversationId);
			socket.to(roomId).emit("message:delivered", {
				messageId: payload.messageId,
				userId,
			});
		},
	);

	socket.on(
		"message:read",
		async (payload: { conversationId: string; messageIds: string[] }) => {
			const roomId = getRoomId(payload.conversationId);
			socket.to(roomId).emit("message:read", {
				messageIds: payload.messageIds,
				userId,
			});

			for (const messageId of payload.messageIds) {
				markMessageRead(messageId, token).catch((err) =>
					console.error("[chat] Failed to mark message as read:", err),
				);
			}
		},
	);
}
