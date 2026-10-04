// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { hitRateLimit, MemoryCounterStore } from "../../src/lib/rateLimit";

afterEach(() => vi.restoreAllMocks());

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
});
