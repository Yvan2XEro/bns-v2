import { getRedis } from "./redis.ts";

const PRESENCE_TTL = 60;
const PRESENCE_PREFIX = "presence:user:";

export async function setOnline(userId: string): Promise<void> {
	const redis = getRedis();
	const key = `${PRESENCE_PREFIX}${userId}`;
	await redis.set(key, Date.now().toString());
	await redis.expire(key, PRESENCE_TTL);
}

export async function setOffline(userId: string): Promise<void> {
	const redis = getRedis();
	const key = `${PRESENCE_PREFIX}${userId}`;
	await redis.del(key);
}

export async function isOnline(userId: string): Promise<boolean> {
	const redis = getRedis();
	const key = `${PRESENCE_PREFIX}${userId}`;
	const result = await redis.get(key);
	return result !== null;
}

export async function refreshPresence(userId: string): Promise<void> {
	const redis = getRedis();
	const key = `${PRESENCE_PREFIX}${userId}`;
	await redis.expire(key, PRESENCE_TTL);
}

export async function getOnlineUsers(
	userIds: string[],
): Promise<string[]> {
	const redis = getRedis();
	const online: string[] = [];

	for (const id of userIds) {
		const result = await redis.get(`${PRESENCE_PREFIX}${id}`);
		if (result !== null) {
			online.push(id);
		}
	}

	return online;
}
