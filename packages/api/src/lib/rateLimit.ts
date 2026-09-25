import { createClient, type RedisClientType } from "redis";

export interface CounterStore {
	increment(key: string, ttlSeconds: number): Promise<number>;
}

export interface RateLimitWindow {
	name: string;
	limit: number;
	windowSeconds: number;
}

/** How often the in-memory store walks its map looking for elapsed windows. */
const SWEEP_INTERVAL_MS = 60_000;

export class MemoryCounterStore implements CounterStore {
	private readonly counters = new Map<
		string,
		{ count: number; expiresAt: number }
	>();
	private lastSweep = 0;

	constructor(private readonly clock: () => number = Date.now) {}

	/** Live entries; the counters are private, this is what a test can observe. */
	get size(): number {
		return this.counters.size;
	}

	async increment(key: string, ttlSeconds: number): Promise<number> {
		const now = this.clock();
		this.sweep(now);
		const current = this.counters.get(key);
		if (!current || current.expiresAt <= now) {
			this.counters.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
			return 1;
		}
		current.count += 1;
		return current.count;
	}

	/**
	 * Keys carry their window number, so an elapsed window's key is never read
	 * again and its `expiresAt` check would never fire: without this sweep the
	 * map grows by roughly two entries per active viewer per hour, for the
	 * lifetime of the process.
	 */
	private sweep(now: number): void {
		if (now - this.lastSweep < SWEEP_INTERVAL_MS) return;
		this.lastSweep = now;
		for (const [key, entry] of this.counters) {
			if (entry.expiresAt <= now) this.counters.delete(key);
		}
	}
}

class RedisCounterStore implements CounterStore {
	private client: RedisClientType | null = null;
	private connecting: Promise<RedisClientType> | null = null;

	constructor(private readonly url: string) {}

	private async getClient(): Promise<RedisClientType> {
		if (this.client?.isOpen) return this.client;
		this.connecting ??= (async () => {
			// A client that dropped out of `isOpen` still owns its socket and its
			// error listener; reconnecting without closing it leaks both.
			const stale = this.client;
			this.client = null;
			if (stale) {
				await stale.disconnect().catch(() => undefined);
				stale.removeAllListeners();
			}
			const client = createClient({ url: this.url }) as RedisClientType;
			client.on("error", (error) =>
				console.error("[rate-limit] Redis error:", error),
			);
			await client.connect();
			this.client = client;
			return client;
		})().finally(() => {
			this.connecting = null;
		});
		return this.connecting;
	}

	async increment(key: string, ttlSeconds: number): Promise<number> {
		const client = await this.getClient();
		const [count] = await client
			.multi()
			.incr(key)
			.expire(key, ttlSeconds)
			.exec();
		return Number(count);
	}
}

let defaultStore: CounterStore | null = null;

export function getCounterStore(): CounterStore {
	defaultStore ??= process.env.REDIS_URL
		? new RedisCounterStore(process.env.REDIS_URL)
		: new MemoryCounterStore();
	return defaultStore;
}

/** Counts this call in every window; true when any window is over its limit. */
export async function hitRateLimit(
	store: CounterStore,
	subject: string,
	windows: readonly RateLimitWindow[],
	nowMs: number = Date.now(),
): Promise<boolean> {
	let limited = false;
	for (const window of windows) {
		const bucket = Math.floor(nowMs / (window.windowSeconds * 1000));
		const count = await store.increment(
			`rl:${window.name}:${subject}:${bucket}`,
			window.windowSeconds,
		);
		if (count > window.limit) limited = true;
	}
	return limited;
}
