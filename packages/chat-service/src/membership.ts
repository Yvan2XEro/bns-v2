import { fetchInboxMembers, invalidateInboxMembers } from "./cache.ts";
import { CHAT_MEMBERSHIP_CHANNEL } from "./channels.ts";
import { getRedis } from "./redis.ts";
import { shopInboxRoom } from "./rooms.ts";

export { CHAT_MEMBERSHIP_CHANNEL };

export interface MembershipChangeMessage {
	type: "shop.members.changed";
	shopId: string;
	removedUserIds: string[];
}

/**
 * The only part of socket.io's `Server` this module consumes — naming the
 * seam instead of importing the whole `Server` type lets a test double
 * implement just these three calls, and `Server` (even with its default,
 * untyped event maps) still satisfies it structurally in production.
 */
export interface MembershipIO {
	in(room: string): {
		socketsLeave(rooms: string[]): unknown;
		fetchSockets(): Promise<Array<{ data: unknown }>>;
	};
	to(room: string): {
		emit(event: string, data: unknown): unknown;
	};
}

function userIdOf(data: unknown): string {
	if (data && typeof data === "object" && "userId" in data) {
		const { userId } = data as { userId?: unknown };
		if (typeof userId === "string") return userId;
	}
	return "";
}

function parse(message: string): MembershipChangeMessage | null {
	try {
		const data = JSON.parse(message) as Partial<MembershipChangeMessage>;
		if (data.type !== "shop.members.changed") return null;
		if (typeof data.shopId !== "string" || data.shopId === "") return null;
		return {
			type: "shop.members.changed",
			shopId: data.shopId,
			removedUserIds: Array.isArray(data.removedUserIds)
				? data.removedUserIds.map(String)
				: [],
		};
	} catch {
		return null;
	}
}

async function shopRoomsOf(shopId: string): Promise<string[]> {
	const rooms = await getRedis().smembers(`shop:${shopId}:rooms`);
	return [...rooms, shopInboxRoom(shopId)];
}

async function evict(
	io: MembershipIO,
	shopId: string,
	userIds: string[],
): Promise<void> {
	if (userIds.length === 0) return;
	const rooms = await shopRoomsOf(shopId);
	for (const userId of userIds) {
		// Through `io.in`, not the socket: the Redis adapter forwards this to
		// every node, which is the whole point — the removed member's socket is
		// very often not on the node that received the event.
		io.in(`user:${userId}`).socketsLeave(rooms);
		io.to(`user:${userId}`).emit("shop:access-revoked", { shopId });
	}
}

export async function applyMembershipChange(
	io: MembershipIO,
	message: MembershipChangeMessage,
): Promise<void> {
	await invalidateInboxMembers(message.shopId);

	if (message.removedUserIds.length > 0) {
		await evict(io, message.shopId, message.removedUserIds);
		return;
	}

	// No ids named — a level drop, a shop suspension, a role change. Read the
	// set fresh and evict whoever is in the room but no longer in it.
	const members = await fetchInboxMembers(message.shopId);
	const sockets = await io.in(shopInboxRoom(message.shopId)).fetchSockets();
	const stale = [
		...new Set(
			sockets
				.map((socket) => userIdOf(socket.data))
				.filter((userId) => userId !== "" && !members.includes(userId)),
		),
	];
	await evict(io, message.shopId, stale);
}

export async function startMembershipSubscriber(
	io: MembershipIO,
	subscriber: {
		subscribe(
			channel: string,
			handler: (message: string) => void,
		): Promise<unknown>;
	},
): Promise<void> {
	await subscriber.subscribe(CHAT_MEMBERSHIP_CHANNEL, (raw) => {
		const message = parse(raw);
		if (!message) return;
		void applyMembershipChange(io, message).catch((error) => {
			console.error(
				JSON.stringify({
					event: "membership:apply:error",
					error: String(error),
					timestamp: new Date().toISOString(),
				}),
			);
		});
	});
}
