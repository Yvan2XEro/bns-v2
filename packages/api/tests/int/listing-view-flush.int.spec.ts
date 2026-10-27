// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { flushListingViewHash } from "../../src/services/listingViewFlush";
import { fakePayload } from "./helpers/fakePayload";

describe("flushListingViewHash", () => {
	it("applies a daily hash once, even when the job is retried", async () => {
		const payload = fakePayload(
			{ listings: [{ id: "listing-1", views: 9, status: "published" }] },
			{ uniques: { "listing-view-flushes": [["listing", "date"]] } },
		);
		const store = new MemoryCounterStore(() =>
			Date.parse("2026-10-05T00:00:00Z"),
		);
		for (let i = 0; i < 3; i++) {
			await store.incrementHash?.("stats:views:20261004", "listing-1", 691200);
		}

		expect(await flushListingViewHash(payload, "20261004", { store })).toEqual({
			processed: 1,
			applied: 1,
		});
		expect(payload.store.listings[0].views).toBe(12);
		expect(payload.store["listing-view-flushes"]).toHaveLength(1);

		expect(await flushListingViewHash(payload, "20261004", { store })).toEqual({
			processed: 1,
			applied: 0,
		});
		expect(payload.store.listings[0].views).toBe(12);
	});

	it("does not create flush markers for listings that no longer exist", async () => {
		const payload = fakePayload(
			{},
			{ uniques: { "listing-view-flushes": [["listing", "date"]] } },
		);
		const store = new MemoryCounterStore();
		await store.incrementHash?.(
			"stats:views:20261004",
			"deleted-listing",
			691200,
		);

		expect(await flushListingViewHash(payload, "20261004", { store })).toEqual({
			processed: 1,
			applied: 0,
		});
		expect(payload.store["listing-view-flushes"] ?? []).toHaveLength(0);
	});
});
