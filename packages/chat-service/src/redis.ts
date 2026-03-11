import { createClient } from "redis";
import { RedisClient } from "bun";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export function createRedisClients() {
	const pubClient = createClient({ url: REDIS_URL });
	const subClient = pubClient.duplicate();
	return { pubClient, subClient };
}

let _redis: RedisClient | null = null;

export function getRedis(): RedisClient {
	if (!_redis) {
		_redis = new RedisClient(REDIS_URL);
	}
	return _redis;
}
