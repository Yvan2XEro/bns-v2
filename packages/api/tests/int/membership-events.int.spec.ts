// @vitest-environment node
import type { PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__setMembershipPublisherForTests,
	buildMembershipMessage,
	CHAT_MEMBERSHIP_CHANNEL,
	queueMembershipChange,
} from "../../src/hooks/membershipEvents";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../../src/lib/transactions";
import { fakePayload } from "./helpers/fakePayload";

/**
 * `fakePayload`'s own `create`/`update` typing only accepts a `transactionID`
 * that is a plain `string`, while `PayloadRequest#transactionID` is typed to
 * allow a `Promise` (see `commitContextOf`'s own doc comment in
 * `lib/transactions.ts`). `withTransaction` never produces that lazy case, so
 * this narrows it the same way, for the fake's benefit rather than `onCommit`'s.
 */
function forFake(req: PayloadRequest): {
	context?: Record<string, unknown>;
	transactionID?: string;
} {
	const { transactionID } = req;
	return {
		context: req.context,
		transactionID:
			typeof transactionID === "string" ? transactionID : undefined,
	};
}

afterEach(() => {
	__setMembershipPublisherForTests(null);
	delete process.env.REDIS_URL;
});

describe("buildMembershipMessage", () => {
	it("is the exact shape chat-service subscribes to", () => {
		expect(buildMembershipMessage("s-1", ["u-1", "u-2"])).toEqual({
			type: "shop.members.changed",
			shopId: "s-1",
			removedUserIds: ["u-1", "u-2"],
		});
	});

	it("defaults removedUserIds to an empty array, which means refetch-and-evict", () => {
		expect(buildMembershipMessage("s-1")).toEqual({
			type: "shop.members.changed",
			shopId: "s-1",
			removedUserIds: [],
		});
	});
});

describe("queueMembershipChange", () => {
	it("does nothing at all when REDIS_URL is unset", async () => {
		const publish = vi.fn(async () => undefined);
		__setMembershipPublisherForTests(publish);
		await queueMembershipChange(null, "s-1", ["u-1"]);
		expect(publish).not.toHaveBeenCalled();
	});

	it("publishes immediately outside a transaction this process owns", async () => {
		process.env.REDIS_URL = "redis://localhost:6379";
		const publish = vi.fn(async () => undefined);
		__setMembershipPublisherForTests(publish);
		await queueMembershipChange({ context: {} }, "s-1", ["u-1"]);
		expect(publish).toHaveBeenCalledWith(
			CHAT_MEMBERSHIP_CHANNEL,
			JSON.stringify(buildMembershipMessage("s-1", ["u-1"])),
		);
	});

	it("waits for the commit when the req comes from withTransaction", async () => {
		process.env.REDIS_URL = "redis://localhost:6379";
		const publish = vi.fn(async () => undefined);
		__setMembershipPublisherForTests(publish);
		const queue: Array<() => unknown> = [];
		const req = {
			context: { afterCommit: queue, afterCommitTransactionID: null },
			transactionID: undefined,
		};
		await queueMembershipChange(req, "s-1", ["u-1"]);
		expect(publish).not.toHaveBeenCalled();
		expect(queue).toHaveLength(1);
		await queue[0]();
		expect(publish).toHaveBeenCalledTimes(1);
	});

	it("swallows a publisher failure so a committed removal is never rolled back by Redis", async () => {
		process.env.REDIS_URL = "redis://localhost:6379";
		__setMembershipPublisherForTests(async () => {
			throw new Error("redis down");
		});
		await expect(
			queueMembershipChange({ context: {} }, "s-1", []),
		).resolves.toBeUndefined();
	});
});

describe("queueMembershipChange against a real withTransaction", () => {
	it("publishes strictly after the adapter's commit, never before", async () => {
		process.env.REDIS_URL = "redis://localhost:6379";
		const order: string[] = [];
		const publish = vi.fn(async () => {
			order.push("publish");
		});
		__setMembershipPublisherForTests(publish);

		const payload = fakePayload();
		const db = payload.db as unknown as {
			commitTransaction: (id: string) => Promise<void>;
		};
		const realCommit = db.commitTransaction.bind(db);
		db.commitTransaction = async (id: string) => {
			order.push("commit");
			await realCommit(id);
		};

		const result = await withTransaction(payload, async (req) => {
			await payload.create({
				collection: "things",
				data: { n: 1 },
				req: forFake(req),
			});
			await queueMembershipChange(req, "s-1", ["u-1"]);
			// The body has returned control to withTransaction's commit phase,
			// but the commit itself has not run yet: the publish must still be
			// pending, proving the callback waited rather than firing eagerly.
			expect(publish).not.toHaveBeenCalled();
			order.push("body");
			return "done";
		});

		expect(result).toBe("done");
		expect(order).toEqual(["body", "commit", "publish"]);
	});

	it("does not publish when the transaction rolls back", async () => {
		process.env.REDIS_URL = "redis://localhost:6379";
		const publish = vi.fn(async () => undefined);
		__setMembershipPublisherForTests(publish);
		const payload = fakePayload();

		await expect(
			withTransaction(payload, async (req) => {
				await payload.create({
					collection: "things",
					data: { n: 1 },
					req: forFake(req),
				});
				await queueMembershipChange(req, "s-1", ["u-1"]);
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(publish).not.toHaveBeenCalled();
		expect(payload.store.things ?? []).toHaveLength(0);
	});

	it("a throwing publisher does not fail the transaction or block sibling after-commit work", async () => {
		process.env.REDIS_URL = "redis://localhost:6379";
		__setMembershipPublisherForTests(async () => {
			throw new Error("redis down");
		});
		const payload = fakePayload();
		const sibling = vi.fn();

		const result = await withTransaction(payload, async (req) => {
			await payload.create({
				collection: "things",
				data: { n: 1 },
				req: forFake(req),
			});
			await queueMembershipChange(req, "s-1", ["u-1"]);
			onCommit(commitContextOf(req), sibling);
			return "done";
		});

		expect(result).toBe("done");
		expect(sibling).toHaveBeenCalledTimes(1);
		expect(payload.store.things).toHaveLength(1);
	});
});
