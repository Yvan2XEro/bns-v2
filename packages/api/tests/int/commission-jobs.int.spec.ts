// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` runs before the mock factories, which vitest hoists above
// every import in this file.
const {
	queueSearchEvent,
	notifyCommissionInvoiceIssued,
	notifyCommissionInvoiceOverdue,
} = vi.hoisted(() => ({
	queueSearchEvent: vi.fn(async () => undefined),
	notifyCommissionInvoiceIssued: vi.fn(async () => undefined),
	notifyCommissionInvoiceOverdue: vi.fn(async () => undefined),
}));
vi.mock("../../src/hooks/searchEvents", () => ({ queueSearchEvent }));
vi.mock("../../src/services/orders/notifications", () => ({
	notifyCommissionInvoiceIssued,
	notifyCommissionInvoiceOverdue,
}));

import { Shops } from "../../src/collections/Shops";
import {
	abandonCarts,
	abandonCartsTask,
	CART_ABANDON_DAYS,
} from "../../src/jobs/abandonCarts";
import {
	enforceCommissionOverdue,
	enforceCommissionOverdueTask,
} from "../../src/jobs/enforceCommissionOverdue";
import {
	issueCommissionInvoices,
	issueCommissionInvoicesTask,
} from "../../src/jobs/issueCommissionInvoices";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const DAY_MS = 86_400_000;

/**
 * A Monday, 06:00 Africa/Douala — the hour `0 5 * * 1` fires at on a UTC
 * host. The week that has just closed is Monday 21 to Sunday 27 September
 * local time, and these two strings are written out rather than recomputed
 * from `weekBoundsDouala`: a test that derives its expectation from the same
 * function under test cannot see that function move.
 */
const MONDAY_RUN = new Date("2026-09-28T05:00:00.000Z");
const CLOSED_WEEK_START = "2026-09-20T23:00:00.000Z";
const CLOSED_WEEK_END = "2026-09-27T22:59:59.999Z";

const afterChange = Shops.hooks?.afterChange?.[0] as (
	args: unknown,
) => Promise<unknown>;

beforeEach(() => {
	vi.useFakeTimers();
	queueSearchEvent.mockClear();
	notifyCommissionInvoiceIssued.mockClear();
	notifyCommissionInvoiceOverdue.mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("abandonCarts", () => {
	function cartWorld(carts: Doc[]) {
		return fakePayload({ carts });
	}

	const cartsOf = (p: FakePayload) => p.store.carts;

	it("marks a cart idle thirty days abandoned", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = cartWorld([
			{
				id: "c-stale",
				user: "u-1",
				status: "active",
				items: [{ quantity: 1 }],
				lastActivityAt: new Date(
					MONDAY_RUN.getTime() - CART_ABANDON_DAYS * DAY_MS,
				).toISOString(),
			},
		]);

		const result = await abandonCarts(payload);

		expect(result).toEqual({ abandoned: 1 });
		expect(cartsOf(payload)[0].status).toBe("abandoned");
	});

	it("leaves a cart touched yesterday active", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = cartWorld([
			{
				id: "c-fresh",
				user: "u-1",
				status: "active",
				items: [{ quantity: 1 }],
				lastActivityAt: new Date(MONDAY_RUN.getTime() - DAY_MS).toISOString(),
			},
		]);

		const result = await abandonCarts(payload);

		expect(result).toEqual({ abandoned: 0 });
		expect(cartsOf(payload)[0].status).toBe("active");
	});

	it("never touches a converted cart", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const longAgo = new Date(MONDAY_RUN.getTime() - 400 * DAY_MS).toISOString();
		const payload = cartWorld([
			{
				id: "c-converted",
				user: "u-1",
				status: "converted",
				items: [],
				convertedOrders: ["o-1"],
				lastActivityAt: longAgo,
			},
			{
				id: "c-abandoned",
				user: "u-2",
				status: "abandoned",
				items: [],
				lastActivityAt: longAgo,
			},
			{
				id: "c-active",
				user: "u-3",
				status: "active",
				items: [{ quantity: 2 }],
				lastActivityAt: longAgo,
			},
		]);

		const result = await abandonCarts(payload);

		// Only the active one moves: the converted cart is a purchase record and
		// the already-abandoned one must not be rewritten on every nightly pass.
		expect(result).toEqual({ abandoned: 1 });
		expect(cartsOf(payload).map((cart) => [cart.id, cart.status])).toEqual([
			["c-converted", "converted"],
			["c-abandoned", "abandoned"],
			["c-active", "abandoned"],
		]);
		const touched = payload.writes.filter((w) => w.op === "update");
		expect(touched.map((w) => w.id)).toEqual(["c-active"]);
	});

	it("runs nightly on the nightly queue", () => {
		expect(CART_ABANDON_DAYS).toBe(30);
		expect(abandonCartsTask.slug).toBe("abandonCarts");
		expect(abandonCartsTask.schedule).toEqual([
			{ cron: "0 3 * * *", queue: "nightly" },
		]);
	});
});

function shop(overrides: Doc = {}): Doc {
	return {
		id: "s-1",
		name: "Akwa Tech",
		handle: "akwatech",
		owner: "u-owner",
		status: "active",
		ordersRestrictedAt: null,
		ordersRestrictedReason: null,
		...overrides,
	};
}

function chargeLine(overrides: Doc = {}): Doc {
	return {
		id: "cl-1",
		shop: "s-1",
		order: "o-1",
		kind: "charge",
		paymentMethod: "cod",
		baseAmount: 45_000,
		amount: 3_600,
		status: "open",
		accruedAt: CLOSED_WEEK_START,
		...overrides,
	};
}

function invoiceWorld(seed: Record<string, Doc[]> = {}) {
	return fakePayload(
		{
			shops: [shop()],
			orders: [{ id: "o-1", orderNumber: "BNS-2609-000001" }],
			"commission-invoices": [],
			"commission-lines": [],
			sequences: [],
			...seed,
		},
		{
			uniques: {
				"commission-invoices": [["invoiceNumber"], ["shop", "periodStart"]],
			},
		},
	);
}

const invoicesOf = (p: FakePayload) => p.store["commission-invoices"];
const linesOf = (p: FakePayload) => p.store["commission-lines"] ?? [];

describe("issueCommissionInvoices", () => {
	it("runs for the week that just closed, in Africa/Douala", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = invoiceWorld({ "commission-lines": [chargeLine()] });

		const result = await issueCommissionInvoices(payload);

		expect(result.issued).toHaveLength(1);
		expect(invoicesOf(payload)[0]).toMatchObject({
			periodStart: CLOSED_WEEK_START,
			periodEnd: CLOSED_WEEK_END,
		});
	});

	it("issues one invoice per shop with open cod lines", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = invoiceWorld({
			shops: [shop(), shop({ id: "s-2", handle: "bonapriso", name: "Bona" })],
			"commission-lines": [
				chargeLine(),
				chargeLine({ id: "cl-2", amount: 1_200 }),
				chargeLine({ id: "cl-3", shop: "s-2", amount: 2_000 }),
			],
		});

		const result = await issueCommissionInvoices(payload);

		expect(result.issued).toHaveLength(2);
		expect(invoicesOf(payload)).toHaveLength(2);
		expect(
			invoicesOf(payload).map((inv) => [inv.shop, inv.commissionTotal]),
		).toEqual([
			["s-1", 4_800],
			["s-2", 2_000],
		]);
	});

	it("skips mobile_money lines", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = invoiceWorld({
			"commission-lines": [
				chargeLine(),
				chargeLine({
					id: "cl-momo",
					paymentMethod: "mobile_money",
					amount: 9_999,
				}),
			],
		});

		const result = await issueCommissionInvoices(payload);

		expect(result.issued).toHaveLength(1);
		// 3 600, not 13 599: a mobile-money commission is withheld at source in
		// P5 and must never reach a cash-on-delivery invoice.
		expect(invoicesOf(payload)[0]).toMatchObject({
			commissionTotal: 3_600,
			lines: ["cl-1"],
		});
		const momo = linesOf(payload).find((line) => line.id === "cl-momo");
		expect(momo?.status).toBe("open");
	});

	it("is idempotent on a second run", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = invoiceWorld({ "commission-lines": [chargeLine()] });

		const first = await issueCommissionInvoices(payload);
		const second = await issueCommissionInvoices(payload);

		expect(first.issued).toHaveLength(1);
		expect(second.issued).toEqual([]);
		expect(invoicesOf(payload)).toHaveLength(1);
	});

	it("notifies commission-invoice-issued once per invoice", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = invoiceWorld({
			shops: [shop(), shop({ id: "s-2", handle: "bonapriso", name: "Bona" })],
			"commission-lines": [
				chargeLine(),
				chargeLine({ id: "cl-3", shop: "s-2", amount: 2_000 }),
			],
		});

		await issueCommissionInvoices(payload);
		await issueCommissionInvoices(payload);

		expect(notifyCommissionInvoiceIssued).toHaveBeenCalledTimes(2);
		const notified = notifyCommissionInvoiceIssued.mock.calls.map(
			(call) => (call as unknown as [unknown, Doc])[1],
		);
		expect(notified.map((inv) => inv.shop).sort()).toEqual(["s-1", "s-2"]);
		for (const invoice of notified) {
			expect(invoice.invoiceNumber).toBeTruthy();
			expect(invoice.status).toBe("issued");
		}
	});

	it("runs Monday 05:00 on the commission queue", () => {
		expect(issueCommissionInvoicesTask.slug).toBe("issueCommissionInvoices");
		expect(issueCommissionInvoicesTask.schedule).toEqual([
			{ cron: "0 5 * * 1", queue: "commission" },
		]);
	});
});

describe("enforceCommissionOverdue", () => {
	function overdueWorld(invoice: Doc, shopOverrides: Doc = {}) {
		return invoiceWorld({
			shops: [shop(shopOverrides)],
			"commission-invoices": [
				{
					id: "inv-1",
					invoiceNumber: "BNS-C-2026-000001",
					shop: "s-1",
					status: "issued",
					totalDue: 4_293,
					...invoice,
				},
			],
		});
	}

	it("sends the due-soon reminder two days before dueAt", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = overdueWorld({
			dueAt: new Date(MONDAY_RUN.getTime() + DAY_MS).toISOString(),
		});

		const result = await enforceCommissionOverdue(payload);

		expect(result).toMatchObject({ marked: [], restricted: [], reported: [] });
		expect(invoicesOf(payload)[0]).toMatchObject({
			status: "issued",
			dueSoonReminderSentAt: MONDAY_RUN.toISOString(),
		});
	});

	it("marks an invoice overdue the moment dueAt passes", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = overdueWorld({
			dueAt: new Date(MONDAY_RUN.getTime() - 60_000).toISOString(),
		});

		const result = await enforceCommissionOverdue(payload);

		expect(result.marked).toEqual(["inv-1"]);
		expect(result.restricted).toEqual([]);
		expect(invoicesOf(payload)[0].status).toBe("overdue");
	});

	it("restricts the shop after three days overdue", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = overdueWorld({
			status: "overdue",
			dueAt: new Date(MONDAY_RUN.getTime() - 3 * DAY_MS).toISOString(),
		});

		const result = await enforceCommissionOverdue(payload);

		expect(result.restricted).toEqual(["s-1"]);
		expect(payload.store.shops[0]).toMatchObject({
			ordersRestrictedAt: MONDAY_RUN.toISOString(),
			ordersRestrictedReason: "commission_overdue",
		});
	});

	it("reports the shop to staff after thirty days overdue", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = overdueWorld({
			status: "overdue",
			dueAt: new Date(MONDAY_RUN.getTime() - 31 * DAY_MS).toISOString(),
			restrictedAt: new Date(MONDAY_RUN.getTime() - 28 * DAY_MS).toISOString(),
		});

		const result = await enforceCommissionOverdue(payload);

		expect(result.reported).toEqual(["inv-1"]);
		expect(payload.logger.error).toHaveBeenCalled();
	});

	it("the restriction publishes shop.updated", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const before = shop();
		const payload = overdueWorld({
			status: "overdue",
			dueAt: new Date(MONDAY_RUN.getTime() - 3 * DAY_MS).toISOString(),
		});

		const result = await enforceCommissionOverdue(payload);
		expect(result.restricted).toEqual(["s-1"]);

		// The job restricts through the shops collection, so the collection's own
		// afterChange is what reaches the search index. Replaying it over the
		// before/after pair the job produced is what ties the two together: a
		// restricted shop whose listings keep advertising `orderable` is the
		// P3 `levelExpiresAt` bug again.
		await afterChange({
			operation: "update",
			doc: payload.store.shops[0],
			previousDoc: before,
			req: { context: {} },
		});

		expect(queueSearchEvent).toHaveBeenCalledWith(
			expect.anything(),
			"shop.updated",
			"s-1",
			{ reindexListings: true },
		);
	});

	// `notifyCommissionInvoiceOverdue` existed in notifications.ts and nothing
	// called it: the workflow's own doc comment named this job as its caller.
	// A seller was being restricted — their shop stops taking orders — with a
	// log line as the only trace. The three stages are asserted by stage name
	// and invoice, so a sweep that notified the wrong one goes red.
	it.each([
		[
			"due_soon",
			{ dueAt: new Date(MONDAY_RUN.getTime() + DAY_MS).toISOString() },
		],
		[
			"overdue",
			{ dueAt: new Date(MONDAY_RUN.getTime() - 60_000).toISOString() },
		],
		[
			"restricted",
			{
				status: "overdue",
				dueAt: new Date(MONDAY_RUN.getTime() - 3 * DAY_MS).toISOString(),
			},
		],
	])("tells the shop at the %s stage", async (stage, invoice) => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = overdueWorld(invoice);

		const result = await enforceCommissionOverdue(payload);

		expect(result.notified).toEqual([{ invoiceId: "inv-1", stage }]);
		expect(notifyCommissionInvoiceOverdue).toHaveBeenCalledTimes(1);
		expect(notifyCommissionInvoiceOverdue).toHaveBeenCalledWith(
			payload,
			expect.objectContaining({ id: "inv-1" }),
			stage,
		);
	});

	// The reminder, the mark and the restriction are each idempotent at the
	// write, so the replay has nothing to announce. Paired with the cases
	// above, which prove the first run does announce.
	it("announces nothing on a replayed sweep", async () => {
		vi.setSystemTime(MONDAY_RUN);
		const payload = overdueWorld({
			status: "overdue",
			dueAt: new Date(MONDAY_RUN.getTime() - 3 * DAY_MS).toISOString(),
		});

		await enforceCommissionOverdue(payload);
		notifyCommissionInvoiceOverdue.mockClear();
		const replay = await enforceCommissionOverdue(payload);

		expect(replay.notified).toEqual([]);
		expect(notifyCommissionInvoiceOverdue).not.toHaveBeenCalled();
	});

	it("runs daily 06:00 on the commission queue", () => {
		expect(enforceCommissionOverdueTask.slug).toBe("enforceCommissionOverdue");
		expect(enforceCommissionOverdueTask.schedule).toEqual([
			{ cron: "0 6 * * *", queue: "commission" },
		]);
	});
});
