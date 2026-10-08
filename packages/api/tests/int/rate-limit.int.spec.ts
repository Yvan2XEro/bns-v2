// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	addDistinctCounter,
	countCounter,
	hitCounter,
	hitRateLimit,
	MemoryCounterStore,
	registerRateLimitExceededHandler,
} from "../../src/lib/rateLimit";

afterEach(() => {
	vi.restoreAllMocks();
	registerRateLimitExceededHandler(null);
});

describe("shared rate limits", () => {
	it("starts a fresh fixed window at its exact boundary", async () => {
		let now = 0;
		const store = new MemoryCounterStore(() => now);
		const windows = [{ name: "reviews", limit: 2, windowSeconds: 60 }];
		expect(await hitRateLimit(store, "user:1", windows, now)).toBe(false);
		expect(await hitRateLimit(store, "user:1", windows, now)).toBe(false);
		expect(await hitRateLimit(store, "user:1", windows, now)).toBe(true);
		now = 60000;
		expect(await hitRateLimit(store, "user:1", windows, now)).toBe(false);
	});

	it("allows commerce through a counter outage and logs the unavailable limiter", async () => {
		const logger = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const store = {
			increment: async () => {
				throw new Error("connection unavailable");
			},
		};
		expect(
			await hitRateLimit(store, "user:1", [
				{ name: "checkout", limit: 1, windowSeconds: 60 },
			]),
		).toBe(false);
		expect(logger.mock.calls[0]?.[0]).toBe(
			"[rate-limit] rateLimit.unavailable",
		);
	});

	it("returns fixed-window counter values and counts distinct members once", async () => {
		let now = 10_000;
		const store = new MemoryCounterStore(() => now);
		const hit = await hitCounter(
			store,
			"rl:signup:install-hash:0",
			{ limit: 1, windowSeconds: 60 },
			now,
		);
		expect(hit).toEqual({ count: 1, allowed: true, resetAt: 60_000 });
		expect(
			await addDistinctCounter(store, "distinct:install:0", "user-1", 60),
		).toBe(1);
		expect(
			await addDistinctCounter(store, "distinct:install:0", "user-1", 60),
		).toBe(1);
		expect(
			await addDistinctCounter(store, "distinct:install:0", "user-2", 60),
		).toBe(2);
		expect(await countCounter(store, "rl:signup:install-hash:0")).toBe(1);
		now = 60_000;
		expect(await countCounter(store, "distinct:install:0")).toBe(0);
	});

	it("atomically deduplicates a key and increments expiring hash fields", async () => {
		let now = 10_000;
		const store = new MemoryCounterStore(() => now);
		expect(await store.setIfAbsent?.("view:1", "1", 30)).toBe(true);
		expect(await store.setIfAbsent?.("view:1", "1", 30)).toBe(false);
		expect(
			await store.incrementHash?.("views:day", "listing-1", 8 * 86400),
		).toBe(1);
		expect(
			await store.incrementHash?.("views:day", "listing-1", 8 * 86400),
		).toBe(2);
		now += 8 * 86400 * 1000;
		expect(
			await store.incrementHash?.("views:day", "listing-1", 8 * 86400),
		).toBe(1);
	});

	it("notifies the signal hook only after a threshold is exceeded", async () => {
		const calls: Array<[string, string, number]> = [];
		registerRateLimitExceededHandler((name, subject, count) => {
			calls.push([name, subject, count]);
		});
		const store = new MemoryCounterStore(() => 0);
		await hitRateLimit(
			store,
			"install-hash",
			[{ name: "accounts-per-install", limit: 1, windowSeconds: 60 }],
			0,
		);
		await hitRateLimit(
			store,
			"install-hash",
			[{ name: "accounts-per-install", limit: 1, windowSeconds: 60 }],
			0,
		);
		expect(calls).toEqual([["accounts-per-install", "install-hash", 2]]);
	});
});
