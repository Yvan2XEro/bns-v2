import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { notifyPayoutHoldReleased } = vi.hoisted(() => ({
	notifyPayoutHoldReleased: vi.fn(async () => undefined),
}));
vi.mock("../../src/services/paymentNotifications", () => ({
	notifyPayoutHoldReleased,
}));

import { expirePayoutHoldsTask } from "../../src/jobs/expirePayoutHolds";
import { withTransaction } from "../../src/lib/transactions";
import {
	liftExpiredShopSuspensions,
	suspendShop,
	suspendUser,
	unsuspendShop,
} from "../../src/services/moderation";
import {
	activeHolds,
	applyFraudRules,
	createHold,
	expirePayoutHolds,
	hasBlockingHold,
	releaseHold,
} from "../../src/services/payoutHolds";
import { type Doc, fakePayload } from "./helpers/fakePayload";

const NOW = Date.parse("2026-10-03T10:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const MOD = { id: "mod-1", role: "moderator" };

function seed(extra: Record<string, Doc[]> = {}) {
	return fakePayload({
		users: [
			{ id: "u-1", role: "user", name: "Aïcha" },
			{ id: "mod-1", role: "moderator", name: "Grâce" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa",
				owner: "u-1",
				status: "active",
			},
			{
				id: "s-2",
				handle: "deido",
				name: "Deido",
				owner: "u-1",
				status: "active",
			},
		],
		listings: [{ id: "l-1", shop: "s-1", seller: "u-1", status: "published" }],
		"moderation-log": [],
		"payout-holds": [],
		orders: [],
		refunds: [],
		...extra,
	});
}

type Fake = ReturnType<typeof seed>;

const run = <T>(payload: Fake, fn: (req: PayloadRequest) => Promise<T>) =>
	withTransaction(payload, fn);

const holds = (payload: Fake) => payload.store["payout-holds"] ?? [];

/** The row without the fields the fake stamps. */
function rowOf(doc: Doc | undefined): Doc {
	const {
		id: _id,
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		...row
	} = doc ?? {};
	return row;
}

function protectedOrder(
	id: string,
	createdAt: string,
	overrides: Doc = {},
): Doc {
	return {
		id,
		shop: "s-1",
		paymentMethod: "mobile_money",
		paymentStatus: "paid",
		status: "paid",
		amounts: { total: 25_000 },
		createdAt,
		...overrides,
	};
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	notifyPayoutHoldReleased.mockClear();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("createHold", () => {
	it.each([
		"fraud_signal",
		"moderation",
		"shop_suspended",
	] as const)("forces blocksCharges on for %s, whatever the caller passes", async (reason) => {
		const payload = seed();
		const hold = await run(payload, (req) =>
			createHold(req, {
				scope: "shop",
				shop: "s-1",
				reason,
				blocksCharges: false,
				createdByType: "system",
			}),
		);
		expect(hold.blocksCharges).toBe(true);
		expect(holds(payload)).toHaveLength(1);
		expect(holds(payload)[0].blocksCharges).toBe(true);
	});

	it("leaves blocksCharges to the caller for the other reasons", async () => {
		const payload = seed();
		const [plain, chosen] = await run(payload, async (req) => [
			await createHold(req, {
				scope: "shop",
				shop: "s-1",
				reason: "payout_account_changed",
				until: at(72 * HOUR),
				createdByType: "system",
			}),
			await createHold(req, {
				scope: "shop",
				shop: "s-1",
				reason: "reconciliation_mismatch",
				blocksCharges: true,
				createdByType: "system",
			}),
		]);
		expect(plain.blocksCharges).toBe(false);
		expect(chosen.blocksCharges).toBe(true);
	});

	it("writes the exact row", async () => {
		const payload = seed();
		await run(payload, (req) =>
			createHold(req, {
				scope: "order",
				shop: "s-1",
				order: "o-1",
				reason: "dispute_open",
				until: new Date(NOW + DAY),
				createdByType: "moderator",
				createdBy: "mod-1",
				note: "Buyer opened a dispute",
			}),
		);
		expect(rowOf(holds(payload)[0])).toEqual({
			scope: "order",
			shop: "s-1",
			order: "o-1",
			reason: "dispute_open",
			blocksCharges: false,
			status: "active",
			until: at(DAY),
			createdByType: "moderator",
			createdBy: "mod-1",
			note: "Buyer opened a dispute",
		});
	});

	it("is idempotent per {scope, shop, order, reason} while active, and opens a new row after release", async () => {
		const payload = seed();
		const input = {
			scope: "order" as const,
			shop: "s-1",
			order: "o-1",
			reason: "return_open" as const,
			createdByType: "system" as const,
		};
		const first = await run(payload, (req) => createHold(req, input));
		const again = await run(payload, (req) => createHold(req, input));
		expect(again.id).toBe(first.id);
		expect(holds(payload)).toHaveLength(1);

		// Any part of the key differing is a different hold.
		await run(payload, (req) => createHold(req, { ...input, order: "o-2" }));
		await run(payload, (req) =>
			createHold(req, { ...input, reason: "dispute_open" }),
		);
		await run(payload, (req) =>
			createHold(req, { ...input, shop: "s-2", order: "o-1" }),
		);
		expect(holds(payload)).toHaveLength(4);

		await run(payload, (req) => releaseHold(req, first.id));
		const reopened = await run(payload, (req) => createHold(req, input));
		expect(reopened.id).not.toBe(first.id);
		expect(holds(payload)).toHaveLength(5);
		expect(
			holds(payload)
				.filter(
					(h) =>
						h.order === "o-1" && h.reason === "return_open" && h.shop === "s-1",
				)
				.map((h) => h.status),
		).toEqual(["released", "active"]);
	});

	it("keeps a shop hold distinct from an order hold of the same reason", async () => {
		const payload = seed();
		await run(payload, (req) =>
			createHold(req, {
				scope: "order",
				shop: "s-1",
				order: "o-1",
				reason: "moderation",
				createdByType: "system",
			}),
		);
		await run(payload, (req) =>
			createHold(req, {
				scope: "shop",
				shop: "s-1",
				reason: "moderation",
				createdByType: "system",
			}),
		);
		expect(holds(payload).map((h) => h.scope)).toEqual(["order", "shop"]);
	});
});

describe("releaseHold", () => {
	it("records who released it, when, and appends the note", async () => {
		const payload = seed();
		const hold = await run(payload, (req) =>
			createHold(req, {
				scope: "shop",
				shop: "s-1",
				reason: "moderation",
				createdByType: "moderator",
				createdBy: "mod-1",
				note: "Checking documents",
			}),
		);
		const released = await run(payload, (req) =>
			releaseHold(req, hold.id, {
				releasedBy: "mod-1",
				note: "Documents fine",
			}),
		);
		expect(released).toMatchObject({
			status: "released",
			releasedAt: at(0),
			releasedBy: "mod-1",
			note: "Checking documents\nDocuments fine",
		});
	});

	it("returns a hold that is no longer active unchanged", async () => {
		const payload = seed({
			"payout-holds": [
				{
					id: "h-1",
					scope: "shop",
					shop: "s-1",
					reason: "moderation",
					status: "expired",
					createdByType: "system",
				},
			],
		});
		const result = await run(payload, (req) =>
			releaseHold(req, "h-1", { releasedBy: "mod-1" }),
		);
		expect(result.status).toBe("expired");
		expect(
			payload.writes.filter((w) => w.collection === "payout-holds"),
		).toHaveLength(0);
	});
});

describe("activeHolds and hasBlockingHold", () => {
	function withHolds() {
		return seed({
			"payout-holds": [
				{
					id: "h-shop",
					scope: "shop",
					shop: "s-1",
					reason: "payout_account_changed",
					blocksCharges: false,
					status: "active",
					createdByType: "system",
					createdAt: at(-3 * HOUR),
				},
				{
					id: "h-o1",
					scope: "order",
					shop: "s-1",
					order: "o-1",
					reason: "fraud_signal",
					blocksCharges: true,
					status: "active",
					createdByType: "system",
					createdAt: at(-2 * HOUR),
				},
				{
					id: "h-o2",
					scope: "order",
					shop: "s-1",
					order: "o-2",
					reason: "dispute_open",
					blocksCharges: false,
					status: "active",
					createdByType: "system",
					createdAt: at(-HOUR),
				},
				{
					id: "h-old",
					scope: "shop",
					shop: "s-1",
					reason: "moderation",
					blocksCharges: true,
					status: "released",
					createdByType: "system",
					createdAt: at(-4 * HOUR),
				},
				{
					id: "h-other",
					scope: "shop",
					shop: "s-2",
					reason: "moderation",
					blocksCharges: true,
					status: "active",
					createdByType: "system",
					createdAt: at(-HOUR),
				},
			],
		});
	}

	it("lists every active hold of the shop, both scopes", async () => {
		const ids = (await activeHolds(withHolds(), { shop: "s-1" })).map(
			(h) => h.id,
		);
		expect(ids).toEqual(["h-shop", "h-o1", "h-o2"]);
	});

	it("for an order: the shop's holds and that order's, never another order's", async () => {
		const ids = (
			await activeHolds(withHolds(), { shop: "s-1", order: "o-1" })
		).map((h) => h.id);
		expect(ids).toEqual(["h-shop", "h-o1"]);
	});

	it("an order hold with blocksCharges does not refuse the shop's checkouts", async () => {
		expect(await hasBlockingHold(withHolds(), "s-1")).toBe(false);
	});

	it("an active shop hold with blocksCharges does", async () => {
		expect(await hasBlockingHold(withHolds(), "s-2")).toBe(true);
	});

	it("a released one no longer does", async () => {
		const payload = withHolds();
		await run(payload, (req) => releaseHold(req, "h-other"));
		expect(await hasBlockingHold(payload, "s-2")).toBe(false);
	});
});

describe("expirePayoutHolds", () => {
	function withExpiring() {
		return seed({
			"payout-holds": [
				{
					id: "h-past",
					scope: "order",
					shop: "s-1",
					order: "o-9",
					reason: "fraud_signal",
					blocksCharges: true,
					status: "active",
					until: at(-1),
					createdByType: "system",
				},
				{
					id: "h-now",
					scope: "shop",
					shop: "s-1",
					reason: "payout_account_changed",
					blocksCharges: false,
					status: "active",
					until: at(0),
					createdByType: "system",
				},
				{
					id: "h-future",
					scope: "shop",
					shop: "s-1",
					reason: "moderation",
					blocksCharges: true,
					status: "active",
					until: at(1000),
					createdByType: "moderator",
				},
				{
					id: "h-forever",
					scope: "shop",
					shop: "s-1",
					reason: "shop_suspended",
					blocksCharges: true,
					status: "active",
					until: null,
					createdByType: "moderator",
				},
				{
					id: "h-released",
					scope: "shop",
					shop: "s-1",
					reason: "moderation",
					blocksCharges: true,
					status: "released",
					until: at(-DAY),
					createdByType: "moderator",
				},
			],
		});
	}

	const statusOf = (payload: Fake, id: string) =>
		holds(payload).find((h) => h.id === id)?.status;

	it("expires active holds past until and leaves the rest alone", async () => {
		const payload = withExpiring();
		const { expired } = await expirePayoutHolds(payload, new Date(NOW));
		expect(expired.sort()).toEqual(["h-now", "h-past"]);
		expect(
			["h-past", "h-now", "h-future", "h-forever", "h-released"].map((id) =>
				statusOf(payload, id),
			),
		).toEqual(["expired", "expired", "active", "active", "released"]);
	});

	it("never expires an until: null hold, however late it runs", async () => {
		const payload = withExpiring();
		await expirePayoutHolds(payload, new Date(NOW + 3650 * DAY));
		expect(statusOf(payload, "h-forever")).toBe("active");
		expect(statusOf(payload, "h-future")).toBe("expired");
	});

	it("notifies the owner once per expired hold, by category only", async () => {
		const payload = withExpiring();
		await expirePayoutHolds(payload, new Date(NOW));
		expect(notifyPayoutHoldReleased).toHaveBeenCalledTimes(2);
		const shop = expect.objectContaining({ id: "s-1", owner: "u-1" });
		expect(notifyPayoutHoldReleased).toHaveBeenCalledWith(shop, {
			holdId: "h-past",
			scope: "order",
			orderId: "o-9",
			category: "security",
			cause: "expired",
		});
		expect(notifyPayoutHoldReleased).toHaveBeenCalledWith(shop, {
			holdId: "h-now",
			scope: "shop",
			orderId: null,
			category: "security",
			cause: "expired",
		});
		expect(JSON.stringify(notifyPayoutHoldReleased.mock.calls)).not.toContain(
			"fraud_signal",
		);
	});

	it("does not overwrite a release that lands between the candidate read and its transaction", async () => {
		const payload = withExpiring();
		const original = payload.findByID.bind(payload);
		payload.findByID = (async (args: Parameters<typeof original>[0]) => {
			if (args.collection === "payout-holds" && args.id === "h-past") {
				const row = holds(payload).find((h) => h.id === "h-past");
				if (row) row.status = "released";
			}
			return original(args);
		}) as typeof payload.findByID;
		const { expired } = await expirePayoutHolds(payload, new Date(NOW));
		expect(expired).toEqual(["h-now"]);
		expect(statusOf(payload, "h-past")).toBe("released");
		expect(notifyPayoutHoldReleased).toHaveBeenCalledTimes(1);
	});

	it("the job reports how many it expired", async () => {
		const payload = withExpiring();
		expect(expirePayoutHoldsTask.slug).toBe("expirePayoutHolds");
		const handler = expirePayoutHoldsTask.handler;
		if (typeof handler !== "function") throw new Error("handler is a path");
		const result = await handler({
			req: { payload } as unknown as PayloadRequest,
		} as Parameters<typeof handler>[0]);
		expect(result).toEqual({ output: { expiredCount: 2 } });
	});
});

describe("shop suspension", () => {
	const suspensionHolds = (payload: Fake) =>
		holds(payload).filter((h) => h.reason === "shop_suspended");

	it("suspendShop creates the blocking shop_suspended hold", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		expect(suspensionHolds(payload)).toHaveLength(1);
		expect(suspensionHolds(payload)[0]).toMatchObject({
			scope: "shop",
			shop: "s-1",
			reason: "shop_suspended",
			blocksCharges: true,
			status: "active",
			until: null,
			createdByType: "moderator",
			createdBy: "mod-1",
		});
		expect(await hasBlockingHold(payload, "s-1")).toBe(true);
	});

	it("writes the hold in the suspension's transaction", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		const holdWrite = payload.writes.find(
			(w) => w.collection === "payout-holds",
		);
		const shopWrite = payload.writes.find((w) => w.collection === "shops");
		expect(holdWrite?.transactionID).toBeTruthy();
		expect(holdWrite?.transactionID).toBe(shopWrite?.transactionID);
	});

	it("a failure after the hold rolls the hold back with the suspension", async () => {
		const payload = seed();
		payload.failWhen = (method, args) =>
			method === "update" && args.collection === "shops";
		await expect(
			suspendShop(payload, MOD, "s-1", { reason: "fraud", durationDays: 7 }),
		).rejects.toThrow("forced failure: update");
		expect(holds(payload)).toHaveLength(0);
		expect(payload.store.shops.find((s) => s.id === "s-1")?.status).toBe(
			"active",
		);
		expect(payload.store["moderation-log"]).toHaveLength(0);
		// The path ran: the hold was written before the forced failure.
		expect(
			payload.writes.filter((w) => w.collection === "payout-holds"),
		).toHaveLength(1);
	});

	it("a failure writing the hold leaves the shop unsuspended", async () => {
		const payload = seed();
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "payout-holds";
		await expect(
			suspendShop(payload, MOD, "s-1", { reason: "fraud", durationDays: 7 }),
		).rejects.toThrow("forced failure: create");
		expect(payload.store.shops.find((s) => s.id === "s-1")?.status).toBe(
			"active",
		);
		expect(payload.store.listings.find((l) => l.id === "l-1")?.status).toBe(
			"published",
		);
		expect(payload.store["moderation-log"]).toHaveLength(0);
	});

	it("unsuspendShop releases it, in its transaction", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await unsuspendShop(payload, MOD, "s-1");
		expect(suspensionHolds(payload)).toHaveLength(1);
		expect(suspensionHolds(payload)[0]).toMatchObject({
			status: "released",
			releasedBy: "mod-1",
			releasedAt: at(0),
		});
		expect(await hasBlockingHold(payload, "s-1")).toBe(false);
	});

	it("a failed unsuspend keeps the hold active", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "moderation-log";
		await expect(unsuspendShop(payload, MOD, "s-1")).rejects.toThrow(
			"forced failure",
		);
		expect(suspensionHolds(payload).map((h) => h.status)).toEqual(["active"]);
		expect(payload.store.shops.find((s) => s.id === "s-1")?.status).toBe(
			"suspended",
		);
	});

	it("unsuspending releases only the suspension hold", async () => {
		const payload = seed();
		await run(payload, (req) =>
			createHold(req, {
				scope: "shop",
				shop: "s-1",
				reason: "moderation",
				createdByType: "moderator",
				createdBy: "mod-1",
			}),
		);
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await unsuspendShop(payload, MOD, "s-1");
		expect(holds(payload).map((h) => [h.reason, h.status])).toEqual([
			["moderation", "active"],
			["shop_suspended", "released"],
		]);
	});

	it("the expiry job lifting a suspension releases its hold as the system", async () => {
		const payload = seed();
		await suspendShop(payload, MOD, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		await liftExpiredShopSuspensions(payload, new Date(NOW + 8 * DAY));
		const [hold] = suspensionHolds(payload);
		expect(hold.status).toBe("released");
		expect(hold.releasedBy).toBeUndefined();
	});

	it("a user suspension cascading to the shop holds it too", async () => {
		const payload = seed();
		await suspendUser(payload, MOD, "u-1", {
			reason: "fraud",
			durationDays: 7,
		});
		expect(
			suspensionHolds(payload)
				.map((h) => [h.shop, h.status])
				.sort(),
		).toEqual([
			["s-1", "active"],
			["s-2", "active"],
		]);
	});
});

describe("fraud rule: a shop's first protected orders and large orders", () => {
	/** `count` protected orders before `o-new`, then `o-new` itself. */
	function shopWith(count: number, newOrder: Doc = {}, extra: Doc[] = []) {
		const earlier = Array.from({ length: count }, (_, i) =>
			protectedOrder(`o-${i + 1}`, at(-(count - i) * HOUR)),
		);
		return seed({
			orders: [...earlier, ...extra, protectedOrder("o-new", at(0), newOrder)],
		});
	}

	const paid = (payload: Fake) =>
		run(payload, (req) =>
			applyFraudRules(req, { event: "order.paid", orderId: "o-new" }),
		);

	it("holds the shop's 3rd protected order", async () => {
		const payload = shopWith(2);
		const placed = await paid(payload);
		expect(placed).toHaveLength(1);
		expect(holds(payload)).toHaveLength(1);
		expect(rowOf(holds(payload)[0])).toEqual({
			scope: "order",
			shop: "s-1",
			order: "o-new",
			reason: "fraud_signal",
			blocksCharges: true,
			status: "active",
			until: null,
			createdByType: "system",
		});
	});

	it("holds the 1st", async () => {
		const payload = shopWith(0);
		await paid(payload);
		expect(holds(payload)).toHaveLength(1);
	});

	it("does not hold the 4th", async () => {
		const payload = shopWith(3);
		expect(await paid(payload)).toEqual([]);
		expect(holds(payload)).toHaveLength(0);
	});

	it("does not count cash-on-delivery or unpaid orders as protected ones", async () => {
		const payload = shopWith(2, {}, [
			protectedOrder("o-cod", at(-30 * HOUR), {
				paymentMethod: "cod",
				paymentStatus: "cod_collected",
			}),
			protectedOrder("o-unpaid", at(-20 * HOUR), {
				paymentStatus: "failed",
			}),
		]);
		await paid(payload);
		expect(holds(payload)).toHaveLength(1);
	});

	it("does not count another shop's orders", async () => {
		const payload = shopWith(0, {}, [
			protectedOrder("o-a", at(-3 * HOUR), { shop: "s-2" }),
			protectedOrder("o-b", at(-2 * HOUR), { shop: "s-2" }),
			protectedOrder("o-c", at(-1 * HOUR), { shop: "s-2" }),
		]);
		await paid(payload);
		expect(holds(payload)).toHaveLength(1);
	});

	it("does not hold a 4th order of 199,999 XAF", async () => {
		const payload = shopWith(3, { amounts: { total: 199_999 } });
		await paid(payload);
		expect(holds(payload)).toHaveLength(0);
	});

	it("holds a 4th order of 200,000 XAF", async () => {
		const payload = shopWith(3, { amounts: { total: 200_000 } });
		await paid(payload);
		expect(holds(payload)).toHaveLength(1);
		expect(holds(payload)[0]).toMatchObject({
			scope: "order",
			order: "o-new",
			reason: "fraud_signal",
		});
	});

	it("does nothing for an order that is not a paid protected one", async () => {
		const payload = shopWith(0, {
			paymentMethod: "cod",
			paymentStatus: "cod_pending",
		});
		expect(await paid(payload)).toEqual([]);
		expect(holds(payload)).toHaveLength(0);
	});

	it("a replayed trigger places one hold", async () => {
		const payload = shopWith(1);
		await paid(payload);
		await paid(payload);
		expect(holds(payload)).toHaveLength(1);
	});

	it("completion ends the hold 72 hours after completedAt, and the expiry job then lifts it", async () => {
		const payload = shopWith(0);
		await paid(payload);
		const order = payload.store.orders.find((o) => o.id === "o-new");
		if (!order) throw new Error("seed");
		order.status = "completed";
		order.timestamps = { completedAt: at(5 * HOUR) };

		const changed = await run(payload, (req) =>
			applyFraudRules(req, { event: "order.completed", orderId: "o-new" }),
		);
		expect(changed.map((h) => h.until)).toEqual([at(77 * HOUR)]);
		expect(holds(payload)[0].until).toBe(at(77 * HOUR));

		expect(
			(await expirePayoutHolds(payload, new Date(NOW + 77 * HOUR - 1))).expired,
		).toEqual([]);
		expect(
			(await expirePayoutHolds(payload, new Date(NOW + 77 * HOUR))).expired,
		).toEqual([holds(payload)[0].id]);
	});

	it("completion leaves a moderator's or a dated hold on the order alone", async () => {
		const payload = seed({
			orders: [
				protectedOrder("o-new", at(0), { timestamps: { completedAt: at(0) } }),
			],
			"payout-holds": [
				{
					id: "h-mod",
					scope: "order",
					shop: "s-1",
					order: "o-new",
					reason: "fraud_signal",
					status: "active",
					until: null,
					createdByType: "moderator",
				},
				{
					id: "h-dispute",
					scope: "order",
					shop: "s-1",
					order: "o-new",
					reason: "dispute_open",
					status: "active",
					until: null,
					createdByType: "system",
				},
			],
		});
		const changed = await run(payload, (req) =>
			applyFraudRules(req, { event: "order.completed", orderId: "o-new" }),
		);
		expect(changed).toEqual([]);
		expect(holds(payload).map((h) => h.until)).toEqual([null, null]);
	});
});

describe("fraud rule: refund rate over 30 days", () => {
	function shopWithRefunds(
		orders: number,
		refunded: number,
		extra: Partial<Record<string, Doc[]>> = {},
	) {
		const rows = Array.from({ length: orders }, (_, i) =>
			protectedOrder(`o-${i + 1}`, at(-(i + 1) * DAY)),
		);
		const refunds = Array.from({ length: refunded }, (_, i) => ({
			id: `r-${i + 1}`,
			order: `o-${i + 1}`,
			shop: "s-1",
			status: "succeeded",
			amount: 1000,
		}));
		return seed({
			orders: [...rows, ...(extra.orders ?? [])],
			refunds: [...refunds, ...(extra.refunds ?? [])],
		});
	}

	const evaluate = (payload: Fake) =>
		run(payload, (req) =>
			applyFraudRules(req, { event: "refund", shopId: "s-1" }),
		);

	it("10 orders with 1 refunded is 10%: no hold", async () => {
		const payload = shopWithRefunds(10, 1);
		expect(await evaluate(payload)).toEqual([]);
		expect(holds(payload)).toHaveLength(0);
	});

	it("10 orders with 2 refunded is 20%: a blocking shop hold until released", async () => {
		const payload = shopWithRefunds(10, 2);
		await evaluate(payload);
		expect(holds(payload)).toHaveLength(1);
		expect(rowOf(holds(payload)[0])).toEqual({
			scope: "shop",
			shop: "s-1",
			reason: "fraud_signal",
			blocksCharges: true,
			status: "active",
			until: null,
			createdByType: "system",
		});
	});

	it("needs at least 10 protected orders: 9 with 3 refunded holds nothing", async () => {
		const payload = shopWithRefunds(9, 3);
		await evaluate(payload);
		expect(holds(payload)).toHaveLength(0);
	});

	it("counts an order refunded twice once", async () => {
		const payload = shopWithRefunds(10, 1, {
			refunds: [
				{
					id: "r-again",
					order: "o-1",
					shop: "s-1",
					status: "pending",
					amount: 500,
				},
			],
		});
		await evaluate(payload);
		expect(holds(payload)).toHaveLength(0);
	});

	it("ignores failed refunds", async () => {
		const payload = shopWithRefunds(10, 1, {
			refunds: [
				{ id: "r-f", order: "o-2", shop: "s-1", status: "failed", amount: 500 },
			],
		});
		await evaluate(payload);
		expect(holds(payload)).toHaveLength(0);
	});

	it("only counts orders of the last 30 days", async () => {
		// 10 recent orders, 1 refunded, plus a refunded order 31 days old.
		const payload = shopWithRefunds(10, 1, {
			orders: [protectedOrder("o-old", at(-31 * DAY))],
			refunds: [
				{
					id: "r-old",
					order: "o-old",
					shop: "s-1",
					status: "succeeded",
					amount: 500,
				},
			],
		});
		await evaluate(payload);
		expect(holds(payload)).toHaveLength(0);
	});

	it("a re-evaluation keeps one hold", async () => {
		const payload = shopWithRefunds(10, 2);
		await evaluate(payload);
		await evaluate(payload);
		expect(holds(payload)).toHaveLength(1);
		expect(await hasBlockingHold(payload, "s-1")).toBe(true);
	});
});
