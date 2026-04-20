import type { Socket } from "socket.io";
import { hasConversationAccess } from "./cache.ts";

export function getRoomId(conversationId: string): string {
	return `conversation:${conversationId}`;
}

export async function joinRoom(
	socket: Socket,
	conversationId: string,
	userId: string,
): Promise<boolean> {
	const hasAccess = await hasConversationAccess(userId, conversationId);
	if (!hasAccess) return false;
	await socket.join(getRoomId(conversationId));
	return true;
}

export function leaveRoom(socket: Socket, conversationId: string): void {
	socket.leave(getRoomId(conversationId));
}
