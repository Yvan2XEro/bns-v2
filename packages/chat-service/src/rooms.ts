import type { Socket } from "socket.io";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";

export function getRoomId(conversationId: string): string {
	return `conversation:${conversationId}`;
}

export async function verifyConversationAccess(
	userId: string,
	conversationId: string,
	token: string,
): Promise<boolean> {
	try {
		const response = await fetch(
			`${PAYLOAD_API_URL}/conversations/${conversationId}?depth=0`,
			{
				headers: {
					Authorization: `JWT ${token}`,
				},
			},
		);

		if (!response.ok) return false;

		const conversation = (await response.json()) as {
			participants: (string | number)[];
		};

		return conversation.participants.some(
			(p) => String(p) === userId,
		);
	} catch {
		return false;
	}
}

export async function joinRoom(
	socket: Socket,
	conversationId: string,
	userId: string,
	token: string,
): Promise<boolean> {
	const hasAccess = await verifyConversationAccess(userId, conversationId, token);
	if (!hasAccess) return false;

	const roomId = getRoomId(conversationId);
	await socket.join(roomId);
	return true;
}

export function leaveRoom(socket: Socket, conversationId: string): void {
	const roomId = getRoomId(conversationId);
	socket.leave(roomId);
}
