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

// ─── Conversation participants cache ─────────────────────────────────────────

/**
 * Get participant IDs for a conversation.
 * Cached in Redis for 10 min — participants almost never change.
 */
export async function getParticipants(
	conversationId: string,
): Promise<string[]> {
	const redis = getRedis();
	const key = `conv:${conversationId}:participants`;

	const cached = await redis.get(key);
	if (cached) return JSON.parse(cached) as string[];

	const token = await getServiceToken();

	const res = await fetch(
		`${PAYLOAD_API_URL}/conversations/${conversationId}?depth=0`,
		{ headers: { Authorization: `JWT ${token}` } },
	);

	if (!res.ok) {
		if (res.status === 401) invalidateServiceToken();
		return [];
	}

	const conv = (await res.json()) as {
		participants: (string | number)[];
	};

	const participants = conv.participants.map(String);
	await redis.setex(key, 10 * 60, JSON.stringify(participants));
	return participants;
}

/**
 * Invalidate participant cache for a conversation (call when participants change).
 */
export async function invalidateParticipants(
	conversationId: string,
): Promise<void> {
	await getRedis().del(`conv:${conversationId}:participants`);
}

// ─── Conversation access check (used at join time) ───────────────────────────

export async function hasConversationAccess(
	userId: string,
	conversationId: string,
): Promise<boolean> {
	const participants = await getParticipants(conversationId);
	if (participants.length === 0) return false;
	return participants.includes(userId);
}
