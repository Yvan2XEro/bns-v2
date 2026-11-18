import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mockFetch as makeFetch } from "./testFetch.ts";

// `verifyToken` caches through Redis, so importing `../auth.ts` without this
// opens a real Valkey socket and the whole file fails with
// `FailedToOpenSocket` for anyone without one running. Mocked here the same
// way cache.test.ts does it, so the file tests `verifyToken` rather than the
// presence of infrastructure.
const redisStore = new Map<string, string>();
const mockRedis = {
	get: mock(async (key: string) => redisStore.get(key) ?? null),
	set: mock(async (key: string, value: string) => {
		redisStore.set(key, value);
		return "OK";
	}),
	del: mock(async (key: string) => {
		redisStore.delete(key);
		return 1;
	}),
	// `verifyTokenCached` writes through `setex`. The file never reached this
	// line before: it died opening the socket, so the caching path these tests
	// exist to cover was never actually executed.
	setex: mock(async (key: string, _ttl: number, value: string) => {
		redisStore.set(key, value);
		return "OK";
	}),
};
mock.module("../redis.ts", () => ({ getRedis: () => mockRedis }));

const { verifyToken } = await import("../auth.ts");

const mockFetch = makeFetch(() =>
	Promise.resolve(new Response(JSON.stringify({ user: null }))),
);

beforeEach(() => {
	mockFetch.mockReset();
	redisStore.clear();
	globalThis.fetch = mockFetch;
});

describe("verifyToken", () => {
	test("returns userId and email on successful Payload auth", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ user: { id: 42, email: "jean@example.com" } }),
				{ status: 200 },
			),
		);

		const result = await verifyToken("valid-token");

		expect(result.userId).toBe("42");
		expect(result.email).toBe("jean@example.com");
		expect(mockFetch).toHaveBeenCalledTimes(1);

		const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(call[1]?.headers).toEqual({
			Authorization: "JWT valid-token",
		});
	});

	test("rejects when Payload returns non-200", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response("Unauthorized", { status: 401 }),
		);

		await expect(verifyToken("bad-token")).rejects.toThrow(
			"Payload auth failed",
		);
	});

	test("rejects when Payload returns no user", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ user: null }), { status: 200 }),
		);

		await expect(verifyToken("empty-token")).rejects.toThrow(
			"No user returned from Payload",
		);
	});

	test("converts numeric userId to string", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ user: { id: 123, email: "test@test.com" } }),
				{ status: 200 },
			),
		);

		const result = await verifyToken("token");
		expect(result.userId).toBe("123");
	});
});
