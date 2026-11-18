import { createHash } from "node:crypto";
import { getRedis } from "./redis.ts";
import { getServiceToken, invalidateServiceToken } from "./serviceAuth.ts";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";

// ─── Auth token cache ─────────────────────────────────────────────────────────

export interface AuthPayload {
	userId: string;
	email?: string;
}

/**
 * Verify a user JWT by calling Payload /users/me — result cached in Redis
 * so reconnections with the same token skip the HTTP round-trip.
 */
export async function verifyTokenCached(token: string): Promise<AuthPayload> {
	const redis = getRedis();
	const key = `auth:token:${createHash("sha256").update(token).digest("hex")}`;

	const cached = await redis.get(key);
	if (cached) return JSON.parse(cached) as AuthPayload;

	const res = await fetch(`${PAYLOAD_API_URL}/users/me`, {
		headers: { Authorization: `JWT ${token}` },
	});

	if (!res.ok) throw new Error(`Payload auth failed: ${res.status}`);

	const data = (await res.json()) as {
		user?: { id: number | string; email?: string };
	};

	if (!data.user?.id) throw new Error("No user returned from Payload");

	const auth: AuthPayload = {
		userId: String(data.user.id),
		email: data.user.email,
	};

	// Cache for 25 min (Payload tokens expire in 30 min by default)
	await redis.setex(key, 25 * 60, JSON.stringify(auth));
	return auth;
}

// ─── Conversation meta cache ─────────────────────────────────────────────────

export interface ConversationMeta {
	participants: string[];
	shopId: string | null;
}

const idOf = (value: unknown): string | null => {
	if (typeof value === "string" || typeof value === "number")
		return String(value);
	if (value && typeof value === "object" && "id" in value) {
		const { id } = value as { id?: unknown };
		return id === undefined || id === null ? null : String(id);
	}
	return null;
};

/**
 * Replaces `getParticipants`. A shop conversation's `participants` is only
 * `[buyer, owner]`; the members who may read and answer it are decided by
 * `getInboxMembers(shopId)`, so the room check needs both values and one
 * cache entry carrying them is one round-trip instead of two.
 */
export async function getConversationMeta(
	conversationId: string,
): Promise<ConversationMeta | null> {
	const redis = getRedis();
	const key = `conv:${conversationId}:meta`;

	const cached = await redis.get(key);
	if (cached) return JSON.parse(cached) as ConversationMeta;

	const token = await getServiceToken();
	const res = await fetch(
		`${PAYLOAD_API_URL}/conversations/${conversationId}?depth=0`,
		{ headers: { Authorization: `JWT ${token}` } },
	);
	if (!res.ok) {
		if (res.status === 401) invalidateServiceToken();
		return null;
	}

	const conv = (await res.json()) as {
		participants?: unknown[];
		shop?: unknown;
	};
	const meta: ConversationMeta = {
		participants: (conv.participants ?? [])
			.map(idOf)
			.filter((id): id is string => Boolean(id)),
		shopId: idOf(conv.shop),
	};
	await redis.setex(key, 10 * 60, JSON.stringify(meta));
	return meta;
}

export async function invalidateConversationMeta(
	conversationId: string,
): Promise<void> {
	await getRedis().del(`conv:${conversationId}:meta`);
}

// ─── Shop inbox members cache ────────────────────────────────────────────────

/** Always goes to the API; `getInboxMembers` is the cached path. */
export async function fetchInboxMembers(shopId: string): Promise<string[]> {
	const token = await getServiceToken();
	const res = await fetch(
		`${PAYLOAD_API_URL}/internal/shops/${shopId}/inbox-members`,
		{ headers: { Authorization: `JWT ${token}` } },
	);
	if (!res.ok) {
		if (res.status === 401) invalidateServiceToken();
		// An empty set fails closed: a member is refused until the API answers
		// again, rather than a stale set keeping a removed member connected.
		return [];
	}
	const data = (await res.json()) as { userIds?: unknown[] };
	return (data.userIds ?? []).map(String);
}

export async function getInboxMembers(shopId: string): Promise<string[]> {
	const redis = getRedis();
	const key = `shop:${shopId}:inbox-members`;

	const cached = await redis.get(key);
	if (cached) return JSON.parse(cached) as string[];

	const userIds = await fetchInboxMembers(shopId);
	// Five minutes, not ten: this is the value a revocation has to invalidate,
	// and the `chat:membership` subscriber is the fast path, not the only one.
	if (userIds.length > 0) {
		await redis.setex(key, 5 * 60, JSON.stringify(userIds));
	}
	return userIds;
}

export async function invalidateInboxMembers(shopId: string): Promise<void> {
	await getRedis().del(`shop:${shopId}:inbox-members`);
}

// ─── Conversation access check (join and send) ───────────────────────────────

export async function hasConversationAccess(
	userId: string,
	conversationId: string,
): Promise<boolean> {
	const meta = await getConversationMeta(conversationId);
	if (!meta) return false;
	if (meta.participants.includes(userId)) return true;
	if (!meta.shopId) return false;
	return (await getInboxMembers(meta.shopId)).includes(userId);
}
