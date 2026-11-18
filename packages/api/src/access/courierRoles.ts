import type { Payload } from "payload";

export type CourierRole = "dispatcher" | "rider";

const ROLE_CACHE_KEY = "courierRoleCache";

export async function resolveCourierRole(
	payload: Payload,
	userId: string | null | undefined,
	courierId: string | null | undefined,
	context?: Record<string, unknown>,
): Promise<CourierRole | null> {
	if (!userId || !courierId) return null;
	let cache: Record<string, CourierRole | null> | null = null;
	if (context) {
		context[ROLE_CACHE_KEY] ??= {};
		cache = context[ROLE_CACHE_KEY] as Record<string, CourierRole | null>;
	}
	const key = `${userId}:${courierId}`;
	if (cache && key in cache) return cache[key];
	const rows = await payload.find({
		collection: "courier-members",
		where: {
			and: [
				{ courier: { equals: courierId } },
				{ user: { equals: userId } },
				{ status: { equals: "active" } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const role = rows.docs[0]?.role ?? null;
	const resolved = role === "dispatcher" || role === "rider" ? role : null;
	if (cache) cache[key] = resolved;
	return resolved;
}
