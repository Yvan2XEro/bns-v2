import {
	getConversationMeta,
	getInboxMembers,
	hasConversationAccess,
} from "./cache.ts";
import { getRedis } from "./redis.ts";

/**
 * The only parts of socket.io's `Socket` these helpers consume — split by
 * what each function actually calls, not the whole `Socket` shape. Naming
 * the seam this way lets a test double implement just the one method and be
 * passed in without a cast; `Socket` itself still satisfies both
 * structurally, so production call sites are unaffected.
 */
export interface JoinableSocket {
	join(room: string): Promise<void> | void;
}

export interface LeavableSocket {
	leave(room: string): Promise<void> | void;
}

export function getRoomId(conversationId: string): string {
	return `conversation:${conversationId}`;
}

export function shopInboxRoom(shopId: string): string {
	return `shop-inbox:${shopId}`;
}

/**
 * The set of room ids a shop's sockets may be in, so the membership
 * subscriber can name them all in one `socketsLeave`. Kept in Redis because
 * the socket being evicted may live on another node.
 */
export async function trackShopRoom(
	shopId: string,
	roomId: string,
): Promise<void> {
	await getRedis().sadd(`shop:${shopId}:rooms`, roomId);
}

export async function joinRoom(
	socket: JoinableSocket,
	conversationId: string,
	userId: string,
): Promise<boolean> {
	const hasAccess = await hasConversationAccess(userId, conversationId);
	if (!hasAccess) return false;
	await socket.join(getRoomId(conversationId));

	const meta = await getConversationMeta(conversationId);
	if (meta?.shopId) await trackShopRoom(meta.shopId, getRoomId(conversationId));

	return true;
}

export function leaveRoom(
	socket: LeavableSocket,
	conversationId: string,
): void {
	socket.leave(getRoomId(conversationId));
}

export async function joinShopInbox(
	socket: JoinableSocket,
	shopId: string,
	userId: string,
): Promise<boolean> {
	const members = await getInboxMembers(shopId);
	if (!members.includes(userId)) return false;
	await socket.join(shopInboxRoom(shopId));
	await trackShopRoom(shopId, shopInboxRoom(shopId));
	return true;
}

export function leaveShopInbox(socket: LeavableSocket, shopId: string): void {
	socket.leave(shopInboxRoom(shopId));
}
