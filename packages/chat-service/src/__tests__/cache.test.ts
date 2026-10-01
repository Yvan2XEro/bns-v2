import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mockFetch } from "./testFetch.ts";

const redisStore = new Map<string, string>();
const mockRedis = {
	get: mock(async (key: string) => redisStore.get(key) ?? null),
	setex: mock(async (key: string, _ttl: number, value: string) => {
		redisStore.set(key, value);
	}),
	del: mock(async (key: string) => {
		redisStore.delete(key);
	}),
	sadd: mock(async () => 1),
	smembers: mock(async () => []),
};

mock.module("../redis.ts", () => ({ getRedis: () => mockRedis }));
mock.module("../serviceAuth.ts", () => ({
	getServiceToken: mock(async () => "service-token"),
	invalidateServiceToken: mock(() => {}),
}));

import {
	getConversationMeta,
	getInboxMembers,
	hasConversationAccess,
	invalidateInboxMembers,
} from "../cache.ts";

const originalFetch = globalThis.fetch;

beforeEach(() => {
	redisStore.clear();
	mockRedis.setex.mockClear();
	mockRedis.del.mockClear();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("getConversationMeta", () => {
	test("caches the participants and the shop id for ten minutes", async () => {
		globalThis.fetch = mockFetch(
			async () =>
				new Response(
					JSON.stringify({ participants: ["u-buyer", "u-owner"], shop: "s-1" }),
					{ status: 200 },
				),
		);

		const meta = await getConversationMeta("c-1");
		expect(meta).toEqual({
			participants: ["u-buyer", "u-owner"],
			shopId: "s-1",
		});
		expect(mockRedis.setex).toHaveBeenCalledWith(
			"conv:c-1:meta",
			10 * 60,
			JSON.stringify({ participants: ["u-buyer", "u-owner"], shopId: "s-1" }),
		);

		globalThis.fetch = mockFetch(async () => {
			throw new Error("should not refetch");
		});
		expect(await getConversationMeta("c-1")).toEqual({
			participants: ["u-buyer", "u-owner"],
			shopId: "s-1",
		});
	});

	test("reports a null shopId for a classic conversation", async () => {
		globalThis.fetch = mockFetch(
			async () =>
				new Response(JSON.stringify({ participants: ["a", "b"] }), {
					status: 200,
				}),
		);
		expect((await getConversationMeta("c-2"))?.shopId).toBeNull();
	});

	test("reads the shop id whether the API populated it or not", async () => {
		globalThis.fetch = mockFetch(
			async () =>
				new Response(
					JSON.stringify({ participants: [{ id: "a" }], shop: { id: "s-9" } }),
					{ status: 200 },
				),
		);
		expect(await getConversationMeta("c-3")).toEqual({
			participants: ["a"],
			shopId: "s-9",
		});
	});

	test("returns null and caches nothing when the API refuses", async () => {
		globalThis.fetch = mockFetch(
			async () => new Response("no", { status: 404 }),
		);
		expect(await getConversationMeta("c-4")).toBeNull();
		expect(mockRedis.setex).not.toHaveBeenCalled();
	});
});

describe("getInboxMembers", () => {
	test("fetches the internal route and caches it for five minutes", async () => {
		globalThis.fetch = mockFetch(async (url) => {
			expect(String(url)).toContain("/internal/shops/s-1/inbox-members");
			return new Response(JSON.stringify({ userIds: ["u-owner", "u-staff"] }), {
				status: 200,
			});
		});

		expect(await getInboxMembers("s-1")).toEqual(["u-owner", "u-staff"]);
		expect(mockRedis.setex).toHaveBeenCalledWith(
			"shop:s-1:inbox-members",
			5 * 60,
			JSON.stringify(["u-owner", "u-staff"]),
		);
	});

	test("returns an empty list when the API refuses, without caching it", async () => {
		globalThis.fetch = mockFetch(
			async () => new Response("no", { status: 403 }),
		);
		expect(await getInboxMembers("s-2")).toEqual([]);
		expect(mockRedis.setex).not.toHaveBeenCalled();
	});

	test("drops the cached set on invalidation", async () => {
		redisStore.set("shop:s-1:inbox-members", JSON.stringify(["u-owner"]));
		await invalidateInboxMembers("s-1");
		expect(mockRedis.del).toHaveBeenCalledWith("shop:s-1:inbox-members");
	});
});

describe("hasConversationAccess", () => {
	test("allows a participant of a classic conversation", async () => {
		redisStore.set(
			"conv:c-1:meta",
			JSON.stringify({ participants: ["u-a", "u-b"], shopId: null }),
		);
		expect(await hasConversationAccess("u-a", "c-1")).toBe(true);
		expect(await hasConversationAccess("u-c", "c-1")).toBe(false);
	});

	test("allows a shop member who is not a participant", async () => {
		redisStore.set(
			"conv:c-2:meta",
			JSON.stringify({ participants: ["u-buyer", "u-owner"], shopId: "s-1" }),
		);
		redisStore.set(
			"shop:s-1:inbox-members",
			JSON.stringify(["u-owner", "u-staff"]),
		);
		expect(await hasConversationAccess("u-staff", "c-2")).toBe(true);
	});

	test("refuses someone who is neither", async () => {
		redisStore.set(
			"conv:c-2:meta",
			JSON.stringify({ participants: ["u-buyer", "u-owner"], shopId: "s-1" }),
		);
		redisStore.set("shop:s-1:inbox-members", JSON.stringify(["u-owner"]));
		expect(await hasConversationAccess("u-staff", "c-2")).toBe(false);
	});

	test("refuses when the conversation cannot be read at all", async () => {
		globalThis.fetch = mockFetch(
			async () => new Response("no", { status: 404 }),
		);
		expect(await hasConversationAccess("u-a", "c-missing")).toBe(false);
	});
});
