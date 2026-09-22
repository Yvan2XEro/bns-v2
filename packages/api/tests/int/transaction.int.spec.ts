// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publish = vi.fn(async () => 1);

vi.mock("redis", () => ({
	createClient: () => ({
		on: vi.fn(),
		connect: vi.fn(async () => undefined),
		isOpen: true,
		publish,
	}),
}));

import { onCommit, withTransaction } from "../../src/lib/transactions";
import { fakePayload } from "./helpers/fakePayload";

describe("withTransaction", () => {
	it("commits and runs after-commit callbacks once, in order", async () => {
		const payload = fakePayload();
		const order: string[] = [];

		const result = await withTransaction(payload, async (req) => {
			await payload.create({ collection: "things", data: { n: 1 }, req });
			onCommit(req, () => {
				order.push("first");
			});
			onCommit(req, () => {
				order.push("second");
			});
			order.push("body");
			return "done";
		});

		expect(result).toBe("done");
		expect(order).toEqual(["body", "first", "second"]);
		expect(payload.store.things).toHaveLength(1);
		expect(payload.writes[0].transactionID).toMatch(/^tx-/);
	});

	it("rolls every write back and skips callbacks when the body throws", async () => {
		const payload = fakePayload({ things: [{ id: "t-1", n: 1 }] });
		const callback = vi.fn();

		await expect(
			withTransaction(payload, async (req) => {
				await payload.update({
					collection: "things",
					id: "t-1",
					data: { n: 2 },
					req,
				});
				await payload.create({ collection: "things", data: { n: 3 }, req });
				onCommit(req, callback);
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(payload.store.things).toEqual([{ id: "t-1", n: 1 }]);
		expect(callback).not.toHaveBeenCalled();
	});

	it("retries a transient transaction error", async () => {
		const payload = fakePayload();
		let calls = 0;

		const result = await withTransaction(payload, async () => {
			calls += 1;
			if (calls === 1) {
				throw Object.assign(new Error("WriteConflict"), {
					errorLabels: ["TransientTransactionError"],
				});
			}
			return calls;
		});

		expect(result).toBe(2);
	});

	it("runs without a transaction when the adapter has none", async () => {
		const payload = fakePayload();
		(payload as unknown as { db: Record<string, unknown> }).db = {};

		const result = await withTransaction(payload, async (req) => {
			expect(req.transactionID).toBeUndefined();
			return 1;
		});

		expect(result).toBe(1);
	});

	it("passes the acting user on the shared req", async () => {
		const payload = fakePayload();
		await withTransaction(
			payload,
			async (req) => {
				expect(req.user).toMatchObject({ id: "u-1" });
			},
			{ user: { id: "u-1" } },
		);
	});
});

describe("onCommit outside a transaction", () => {
	it("reports that nothing was queued", () => {
		expect(onCommit({ context: {} }, () => undefined)).toBe(false);
		expect(onCommit(undefined, () => undefined)).toBe(false);
	});
});

describe("queueSearchEvent", () => {
	// `delete process.env.REDIS_URL` is the natural cleanup, but biome rewrites
	// it to an `undefined` assignment, which Node stores as the string
	// "undefined" — truthy, so the variable would leak into later tests.
	beforeEach(() => {
		vi.stubEnv("REDIS_URL", "redis://test");
		publish.mockClear();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("publishes a listing event immediately outside a transaction", async () => {
		const { queueSearchEvent } = await import("../../src/hooks/searchEvents");
		await queueSearchEvent({ context: {} }, "listing.updated", "l-1");
		expect(publish).toHaveBeenCalledWith(
			"search:index",
			JSON.stringify({ event: "listing.updated", listingId: "l-1" }),
		);
	});

	it("defers a shop event until the transaction commits", async () => {
		const { queueSearchEvent } = await import("../../src/hooks/searchEvents");
		const payload = fakePayload();

		await withTransaction(payload, async (req) => {
			await queueSearchEvent(req, "shop.updated", "s-1", {
				reindexListings: true,
			});
			expect(publish).not.toHaveBeenCalled();
		});

		expect(publish).toHaveBeenCalledWith(
			"search:index",
			JSON.stringify({
				event: "shop.updated",
				shopId: "s-1",
				reindexListings: true,
			}),
		);
	});
});
