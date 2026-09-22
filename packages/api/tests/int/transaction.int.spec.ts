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

import {
	afterCommitScope,
	onCommit,
	withTransaction,
} from "../../src/lib/transactions";
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

	it("neither rolls back nor re-runs the body when the commit fails", async () => {
		const payload = fakePayload();
		const rollback = vi.spyOn(payload.db, "rollbackTransaction");
		vi.spyOn(payload.db, "commitTransaction").mockRejectedValue(
			// A commit can carry this label too; re-running the body from here
			// would apply a transaction whose commit may already be durable.
			Object.assign(new Error("commit refused"), {
				errorLabels: ["TransientTransactionError"],
			}),
		);
		const callback = vi.fn();
		let bodies = 0;

		await expect(
			withTransaction(payload, async (req) => {
				bodies += 1;
				onCommit(req, callback);
			}),
		).rejects.toThrow("commit refused");

		expect(bodies).toBe(1);
		expect(rollback).not.toHaveBeenCalled();
		expect(callback).not.toHaveBeenCalled();
	});

	it("retries the commit alone when its result is unknown", async () => {
		const payload = fakePayload();
		const committed = payload.db.commitTransaction.bind(payload.db);
		let commits = 0;
		let bodies = 0;
		vi.spyOn(payload.db, "commitTransaction").mockImplementation(
			async (id: string) => {
				commits += 1;
				if (commits === 1) {
					throw Object.assign(new Error("commit acknowledgement lost"), {
						errorLabels: ["UnknownTransactionCommitResult"],
					});
				}
				await committed(id);
			},
		);
		const callback = vi.fn();

		const result = await withTransaction(payload, async (req) => {
			bodies += 1;
			await payload.create({ collection: "things", data: { n: 1 }, req });
			onCommit(req, callback);
			return "done";
		});

		expect(result).toBe("done");
		expect(bodies).toBe(1);
		expect(commits).toBe(2);
		expect(callback).toHaveBeenCalledTimes(1);
		expect(payload.store.things).toHaveLength(1);
	});

	it("gives up on a commit whose result stays unknown, without rolling back", async () => {
		const payload = fakePayload();
		const rollback = vi.spyOn(payload.db, "rollbackTransaction");
		vi.spyOn(payload.db, "commitTransaction").mockRejectedValue(
			Object.assign(new Error("commit acknowledgement lost"), {
				errorLabels: ["UnknownTransactionCommitResult"],
			}),
		);
		const callback = vi.fn();

		await expect(
			withTransaction(payload, async (req) => {
				onCommit(req, callback);
			}),
		).rejects.toThrow("commit acknowledgement lost");

		// The writes may be durable, so undoing them is not an option; the
		// after-commit work is skipped because the caller is told this failed.
		expect(rollback).not.toHaveBeenCalled();
		expect(callback).not.toHaveBeenCalled();
		expect(payload.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ transactionID: expect.any(String) }),
			expect.stringContaining("still unknown"),
		);
	});

	it("refuses an adapter that opens transactions it cannot commit", async () => {
		const payload = fakePayload();
		const body = vi.fn();
		(payload as unknown as { db: Record<string, unknown> }).db = {
			beginTransaction: async () => "tx-orphan",
		};

		await expect(withTransaction(payload, async () => body())).rejects.toThrow(
			/cannot commit/,
		);
		expect(body).not.toHaveBeenCalled();
	});

	it("logs a rollback that itself fails", async () => {
		const payload = fakePayload();
		vi.spyOn(payload.db, "rollbackTransaction").mockRejectedValue(
			new Error("rollback refused"),
		);

		await expect(
			withTransaction(payload, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(payload.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ transactionID: expect.any(String) }),
			expect.stringContaining("rollback failed"),
		);
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
		expect(afterCommitScope({ context: {} })).toBe("none");
	});

	it("refuses a transaction this helper does not own", async () => {
		// Payload opens one transaction per admin-panel save, so a hook can see a
		// transactionID with no queue behind it.
		const foreign = { context: {}, transactionID: "payload-tx-1" };
		expect(afterCommitScope(foreign)).toBe("foreign");
		expect(onCommit(foreign, () => undefined)).toBe(false);

		const payload = fakePayload();
		await withTransaction(payload, async (req) => {
			expect(afterCommitScope(req)).toBe("queued");
			// The same context under a different transaction is not ours either.
			expect(
				afterCommitScope({ context: req.context, transactionID: "other-tx" }),
			).toBe("foreign");
		});
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

	it("publishes immediately inside a transaction it does not own", async () => {
		const { queueSearchEvent } = await import("../../src/hooks/searchEvents");
		await queueSearchEvent(
			{ context: {}, transactionID: "payload-tx-1" },
			"listing.updated",
			"l-2",
		);
		expect(publish).toHaveBeenCalledWith(
			"search:index",
			JSON.stringify({ event: "listing.updated", listingId: "l-2" }),
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
