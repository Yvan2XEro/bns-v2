import { describe, test, expect, mock, beforeEach } from "bun:test";

const store = new Map<string, string>();
const expireTtls = new Map<string, number>();

const mockRedis = {
	set: mock((key: string, value: string) => {
		store.set(key, value);
		return Promise.resolve();
	}),
	get: mock((key: string) => {
		return Promise.resolve(store.get(key) ?? null);
	}),
	del: mock((key: string) => {
		store.delete(key);
		return Promise.resolve();
	}),
	expire: mock((key: string, ttl: number) => {
		expireTtls.set(key, ttl);
		return Promise.resolve();
	}),
	incr: mock(() => Promise.resolve(1)),
};

mock.module("../redis.ts", () => ({
	getRedis: () => mockRedis,
}));

import {
	setOnline,
	setOffline,
	isOnline,
	refreshPresence,
	getOnlineUsers,
} from "../presence.ts";

beforeEach(() => {
	store.clear();
	expireTtls.clear();
	mockRedis.set.mockClear();
	mockRedis.get.mockClear();
	mockRedis.del.mockClear();
	mockRedis.expire.mockClear();
});

describe("setOnline", () => {
	test("sets the presence key with a TTL", async () => {
		await setOnline("user-1");

		expect(store.has("presence:user:user-1")).toBe(true);
		expect(mockRedis.expire).toHaveBeenCalledWith(
			"presence:user:user-1",
			60,
		);
	});

	test("stores the current timestamp", async () => {
		const before = Date.now();
		await setOnline("user-1");
		const after = Date.now();

		const value = Number(store.get("presence:user:user-1"));
		expect(value).toBeGreaterThanOrEqual(before);
		expect(value).toBeLessThanOrEqual(after);
	});
});

describe("setOffline", () => {
	test("removes the presence key", async () => {
		store.set("presence:user:user-1", "12345");

		await setOffline("user-1");

		expect(store.has("presence:user:user-1")).toBe(false);
		expect(mockRedis.del).toHaveBeenCalledWith("presence:user:user-1");
	});
});

describe("isOnline", () => {
	test("returns true when presence key exists", async () => {
		store.set("presence:user:user-1", "12345");

		const result = await isOnline("user-1");
		expect(result).toBe(true);
	});

	test("returns false when presence key does not exist", async () => {
		const result = await isOnline("user-2");
		expect(result).toBe(false);
	});
});

describe("refreshPresence", () => {
	test("refreshes the TTL on the presence key", async () => {
		store.set("presence:user:user-1", "12345");

		await refreshPresence("user-1");

		expect(mockRedis.expire).toHaveBeenCalledWith(
			"presence:user:user-1",
			60,
		);
	});
});

describe("getOnlineUsers", () => {
	test("returns only users that are online", async () => {
		store.set("presence:user:user-1", "12345");
		store.set("presence:user:user-3", "12345");

		const online = await getOnlineUsers([
			"user-1",
			"user-2",
			"user-3",
		]);

		expect(online).toEqual(["user-1", "user-3"]);
	});

	test("returns empty array when no users are online", async () => {
		const online = await getOnlineUsers(["user-1", "user-2"]);
		expect(online).toEqual([]);
	});

	test("returns empty array for empty input", async () => {
		const online = await getOnlineUsers([]);
		expect(online).toEqual([]);
	});
});
