import { createClient, type RedisClientType } from "redis";

export interface CounterStore {
	increment(key: string, ttlSeconds: number): Promise<number>;
	setIfAbsent?(
		key: string,
		value: string,
		ttlSeconds: number,
	): Promise<boolean>;
	incrementHash?(
		key: string,
		field: string,
		ttlSeconds: number,
	): Promise<number>;
	getHash?(key: string): Promise<Record<string, string>>;
	count?(key: string): Promise<number>;
	distinctAdd?(
		key: string,
		member: string,
		ttlSeconds: number,
	): Promise<number>;
}

export interface RateLimitResult {
	count: number;
	allowed: boolean;
	resetAt: number;
}

type ExceededHandler = (
	name: string,
	subject: string,
	count: number,
) => Promise<void> | void;

let exceededHandler: ExceededHandler | null = null;

export function registerRateLimitExceededHandler(
	handler: ExceededHandler | null,
): void {
	exceededHandler = handler;
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
	private readonly sets = new Map<
		string,
		{ members: Set<string>; expiresAt: number }
	>();
	private readonly values = new Map<
		string,
		{ value: string; expiresAt: number }
	>();
	private readonly hashes = new Map<
		string,
		{ fields: Map<string, number>; expiresAt: number }
	>();

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

	async setIfAbsent(
		key: string,
		value: string,
		ttlSeconds: number,
	): Promise<boolean> {
		const now = this.clock();
		this.sweep(now);
		const current = this.values.get(key);
		if (current && current.expiresAt > now) return false;
		this.values.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
		return true;
	}

	async incrementHash(
		key: string,
		field: string,
		ttlSeconds: number,
	): Promise<number> {
		const now = this.clock();
		this.sweep(now);
		let current = this.hashes.get(key);
		if (!current || current.expiresAt <= now) {
			current = { fields: new Map(), expiresAt: now + ttlSeconds * 1000 };
			this.hashes.set(key, current);
		}
		const next = (current.fields.get(field) ?? 0) + 1;
		current.fields.set(field, next);
		return next;
	}

	async getHash(key: string): Promise<Record<string, string>> {
		const current = this.hashes.get(key);
		if (!current || current.expiresAt <= this.clock()) return {};
		return Object.fromEntries(
			[...current.fields].map(([field, value]) => [field, String(value)]),
		);
	}

	async count(key: string): Promise<number> {
		const current = this.counters.get(key);
		if (!current || current.expiresAt <= this.clock()) return 0;
		return current.count;
	}

	async distinctAdd(
		key: string,
		member: string,
		ttlSeconds: number,
	): Promise<number> {
		const now = this.clock();
		this.sweep(now);
		let current = this.sets.get(key);
		if (!current || current.expiresAt <= now) {
			current = { members: new Set(), expiresAt: now + ttlSeconds * 1000 };
			this.sets.set(key, current);
		}
		current.members.add(member);
		return current.members.size;
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
		for (const [key, entry] of this.sets) {
			if (entry.expiresAt <= now) this.sets.delete(key);
		}
		for (const [key, entry] of this.values) {
			if (entry.expiresAt <= now) this.values.delete(key);
		}
		for (const [key, entry] of this.hashes) {
			if (entry.expiresAt <= now) this.hashes.delete(key);
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
			.expire(key, ttlSeconds, "NX")
			.exec();
		return Number(count);
	}

	async setIfAbsent(
		key: string,
		value: string,
		ttlSeconds: number,
	): Promise<boolean> {
		const result = await (await this.getClient()).set(key, value, {
			EX: ttlSeconds,
			NX: true,
		});
		return result === "OK";
	}

	async incrementHash(
		key: string,
		field: string,
		ttlSeconds: number,
	): Promise<number> {
		const [count] = await (await this.getClient())
			.multi()
			.hIncrBy(key, field, 1)
			.expire(key, ttlSeconds, "NX")
			.exec();
		return Number(count);
	}

	async getHash(key: string): Promise<Record<string, string>> {
		return (await this.getClient()).hGetAll(key);
	}

	async count(key: string): Promise<number> {
		const value = await (await this.getClient()).get(key);
		return value === null ? 0 : Number(value);
	}

	async distinctAdd(
		key: string,
		member: string,
		ttlSeconds: number,
	): Promise<number> {
		const client = await this.getClient();
		const [added, cardinality] = await client
			.multi()
			.sAdd(key, member)
			.expire(key, ttlSeconds, "NX")
			.sCard(key)
			.exec();
		void added;
		return Number(cardinality);
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
	try {
		for (const window of windows) {
			const bucket = Math.floor(nowMs / (window.windowSeconds * 1000));
			const count = await store.increment(
				`rl:${window.name}:${subject}:${bucket}`,
				window.windowSeconds,
			);
			if (count > window.limit) {
				limited = true;
				await notifyExceeded(window.name, subject, count);
			}
		}
	} catch (error) {
		console.error("[rate-limit] rateLimit.unavailable", error);
		return false;
	}
	return limited;
}

export async function hitCounter(
	store: CounterStore,
	key: string,
	options: { limit: number; windowSeconds: number },
	nowMs = Date.now(),
): Promise<RateLimitResult> {
	const bucket = Math.floor(nowMs / (options.windowSeconds * 1000));
	const resetAt = (bucket + 1) * options.windowSeconds * 1000;
	try {
		const count = await store.increment(key, options.windowSeconds);
		if (count > options.limit) await notifyExceeded(key, key, count);
		return { count, allowed: count <= options.limit, resetAt };
	} catch (error) {
		console.error("[rate-limit] rateLimit.unavailable", error);
		return { count: 0, allowed: true, resetAt };
	}
}

export async function countCounter(
	store: CounterStore,
	key: string,
): Promise<number> {
	if (!store.count) throw new Error("Counter store does not support count().");
	return store.count(key);
}

export async function addDistinctCounter(
	store: CounterStore,
	key: string,
	member: string,
	windowSeconds: number,
): Promise<number> {
	if (!store.distinctAdd)
		throw new Error("Counter store does not support distinctAdd().");
	return store.distinctAdd(key, member, windowSeconds);
}

async function notifyExceeded(
	name: string,
	subject: string,
	count: number,
): Promise<void> {
	if (!exceededHandler) return;
	try {
		await exceededHandler(name, subject, count);
	} catch (error) {
		console.error("[rate-limit] exceeded hook failed", error);
	}
}
