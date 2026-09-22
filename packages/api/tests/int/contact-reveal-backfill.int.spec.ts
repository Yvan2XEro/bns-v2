// @vitest-environment node
import { describe, expect, it } from "vitest";
import { revealWindowFor } from "../../src/services/contactReveal";
import { backfillContactRevealWindows } from "../../src/services/contactRevealBackfill";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T10:00:00.000Z");
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

/** A row as it was written before `revealWindow` existed. */
const legacy = (id: string, viewer: string, listing: string, when: Date) => ({
	id,
	viewer,
	listing,
	seller: "seller",
	createdAt: when.toISOString(),
	updatedAt: when.toISOString(),
});

function fixture() {
	return fakePayload({
		"contact-reveals": [
			// Same viewer and listing, minutes apart: one bucket, one survivor.
			legacy("cr-dup-old", "buyer", "l-1", at(-3 * HOUR)),
			legacy("cr-dup-new", "buyer", "l-1", at(-3 * HOUR + 60_000)),
			// Same pair but three days earlier: a different bucket, kept.
			legacy("cr-older", "buyer", "l-1", at(-72 * HOUR)),
			// Untouched neighbours.
			legacy("cr-other-listing", "buyer", "l-2", at(-3 * HOUR)),
			legacy("cr-other-viewer", "buyer-2", "l-1", at(-3 * HOUR)),
			{
				...legacy("cr-stamped", "buyer-3", "l-1", at(-HOUR)),
				revealWindow: revealWindowFor(at(-HOUR)),
			},
		],
	});
}

const ids = (payload: ReturnType<typeof fixture>) =>
	payload.store["contact-reveals"].map((row) => row.id).sort();

describe("backfillContactRevealWindows", () => {
	it("stamps legacy rows from their own creation time", async () => {
		const payload = fixture();

		const result = await backfillContactRevealWindows(payload, { now: NOW });

		expect(result.backfilled).toBe(5);
		const older = payload.store["contact-reveals"].find(
			(row) => row.id === "cr-older",
		);
		expect(older?.revealWindow).toBe(revealWindowFor(at(-72 * HOUR)));
		for (const row of payload.store["contact-reveals"]) {
			expect(typeof row.revealWindow).toBe("number");
		}
	});

	it("keeps the earliest of a colliding group and drops the later duplicates", async () => {
		const payload = fixture();

		const result = await backfillContactRevealWindows(payload, { now: NOW });

		expect(result.removed).toBe(1);
		expect(ids(payload)).toEqual([
			"cr-dup-old",
			"cr-older",
			"cr-other-listing",
			"cr-other-viewer",
			"cr-stamped",
		]);
	});

	it("leaves an already stamped row alone", async () => {
		const payload = fixture();
		const before = payload.store["contact-reveals"].find(
			(row) => row.id === "cr-stamped",
		)?.updatedAt;

		await backfillContactRevealWindows(payload, { now: NOW });

		const after = payload.store["contact-reveals"].find(
			(row) => row.id === "cr-stamped",
		);
		expect(after?.updatedAt).toBe(before);
	});

	it("changes nothing on a second run", async () => {
		const payload = fixture();
		await backfillContactRevealWindows(payload, { now: NOW });
		const snapshot = structuredClone(payload.store["contact-reveals"]);

		const second = await backfillContactRevealWindows(payload, { now: NOW });

		expect(second).toEqual({ backfilled: 0, removed: 0 });
		expect(payload.store["contact-reveals"]).toEqual(snapshot);
	});

	it("falls back to the run clock for a row with no usable timestamp", async () => {
		const payload = fakePayload({
			"contact-reveals": [
				{ id: "cr-undated", viewer: "buyer", listing: "l-1", seller: "seller" },
			],
		});

		await backfillContactRevealWindows(payload, { now: NOW });

		expect(payload.store["contact-reveals"][0]?.revealWindow).toBe(
			revealWindowFor(NOW),
		);
	});
});
