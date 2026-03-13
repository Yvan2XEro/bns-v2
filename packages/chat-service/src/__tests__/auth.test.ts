import { beforeEach, describe, expect, mock, test } from "bun:test";
import { verifyToken } from "../auth.ts";

const mockFetch = mock(() =>
	Promise.resolve(new Response(JSON.stringify({ user: null }))),
);

beforeEach(() => {
	mockFetch.mockReset();
	// @ts-expect-error - mock global fetch
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

		expect(verifyToken("bad-token")).rejects.toThrow("Payload auth failed");
	});

	test("rejects when Payload returns no user", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ user: null }), { status: 200 }),
		);

		expect(verifyToken("empty-token")).rejects.toThrow(
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
