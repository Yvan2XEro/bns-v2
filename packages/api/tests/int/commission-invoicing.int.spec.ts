// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { weekBoundsDouala } from "../../src/lib/orderMath";
import { withTransaction } from "../../src/lib/transactions";
import type { Order, PaymentIntent } from "../../src/payload-types";
import { issueApplicationFeeCommissionInvoice } from "../../src/services/buyerFeeInvoices";
import {
	applyCommissionSettlement,
	enforceOverdue,
	issueCommissionCredit,
	issueInvoicesForWeek,
	payInvoice,
	waiveInvoice,
} from "../../src/services/commission";
import { postingFor, postLedger } from "../../src/services/ledger";
import type { Actor } from "../../src/services/moderation";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

function intent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
	return {
		id: "pi-1",
		purpose: "commission",
		targetType: "commission-invoice",
		targetId: "inv-1",
		amount: 4_293,
		currency: "XAF",
		provider: "notchpay",
		status: "succeeded",
		idempotencyKey: "commission:inv-1",
		createdAt: "2026-09-22T00:00:00.000Z",
		updatedAt: "2026-09-22T00:00:00.000Z",
		...overrides,
	};
}

const NOW = new Date("2026-09-22T09:00:00.000Z"); // a Tuesday, Africa/Douala
const { periodStart, periodEnd } = weekBoundsDouala(NOW);
const DAY_MS = 86_400_000;

function shop(overrides: Doc = {}): Doc {
	return {
		id: "s-1",
		name: "Shop",
		handle: "shop",
		owner: "u-owner",
		status: "active",
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
		accruedAt: periodStart,
		...overrides,
	};
}

function world(seed: Record<string, Doc[]> = {}) {
	return fakePayload(
		{
			shops: [shop()],
			orders: [{ id: "o-1", orderNumber: "BNS-2609-000001" }],
			"commission-invoices": [],
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
const shopOf = (p: FakePayload) => p.store.shops[0];

describe("issueInvoicesForWeek", () => {
	it("the worked example: 45 000 subtotal -> 3 600 / 693 / 4 293", async () => {
		const payload = world({ "commission-lines": [chargeLine()] });
		const result = await issueInvoicesForWeek(payload, NOW);

		expect(result.rolledOver).toEqual([]);
		expect(result.netted).toEqual([]);
		expect(result.issued).toHaveLength(1);

		const invoice = invoicesOf(payload).find((i) => i.id === result.issued[0]);
		expect(invoice).toMatchObject({
			status: "issued",
			commissionTotal: 3_600,
			vatAmount: 693,
			totalDue: 4_293,
			periodStart,
			periodEnd,
		});
		expect(linesOf(payload)[0]).toMatchObject({
			status: "invoiced",
			invoice: invoice?.id,
		});
	});

	it("ignores a line accrued after periodEnd", async () => {
		const afterEnd = new Date(
			new Date(periodEnd).getTime() + DAY_MS,
		).toISOString();
		const payload = world({
			"commission-lines": [chargeLine({ accruedAt: afterEnd })],
		});
		const result = await issueInvoicesForWeek(payload, NOW);

		expect(result.issued).toEqual([]);
		expect(result.rolledOver).toEqual([]);
		expect(linesOf(payload)[0].status).toBe("open");
	});

	it("rolls a below-minimum total into the next week, leaving the lines open", async () => {
		const payload = world({
			"commission-lines": [chargeLine({ amount: 200 })], // < minInvoiceAmount (500)
		});
		const result = await issueInvoicesForWeek(payload, NOW);

		expect(result.rolledOver).toEqual(["s-1"]);
		expect(result.issued).toEqual([]);
		expect(invoicesOf(payload)).toHaveLength(0);
		expect(linesOf(payload)[0].status).toBe("open");
	});

	it("nets a negative total into a carry-over credit against a void invoice", async () => {
		const payload = world({
			"commission-lines": [
				{
					id: "cl-credit",
					shop: "s-1",
					kind: "credit",
					amount: 1_200,
					status: "open",
					accruedAt: periodStart,
				},
			],
		});
		const result = await issueInvoicesForWeek(payload, NOW);

		expect(result.netted).toHaveLength(1);
		expect(result.issued).toEqual([]);
		const invoice = invoicesOf(payload).find((i) => i.id === result.netted[0]);
		expect(invoice).toMatchObject({ status: "void", totalDue: 0 });
		expect(invoice?.commissionTotal).toBe(-1_200);

		const carryOver = linesOf(payload).find((l) => l.kind === "carry_over");
		expect(carryOver).toMatchObject({
			amount: 1_200,
			status: "open",
			shop: "s-1",
		});

		const creditLine = linesOf(payload).find((l) => l.id === "cl-credit");
		expect(creditLine?.status).toBe("invoiced");
	});

	it("is idempotent per (shop, periodStart): a second run issues nothing", async () => {
		const payload = world({ "commission-lines": [chargeLine()] });
		const first = await issueInvoicesForWeek(payload, NOW);
		expect(first.issued).toHaveLength(1);

		const second = await issueInvoicesForWeek(payload, NOW);
		expect(second).toEqual({ issued: [], rolledOver: [], netted: [] });
		expect(invoicesOf(payload)).toHaveLength(1);
	});

	it("the unique index refuses a hand-made duplicate (shop, periodStart)", async () => {
		const payload = world();
		await payload.create({
			collection: "commission-invoices",
			data: { invoiceNumber: "BNS-C-2026-000001", shop: "s-1", periodStart },
		});

		await expect(
			payload.create({
				collection: "commission-invoices",
				data: { invoiceNumber: "BNS-C-2026-000002", shop: "s-1", periodStart },
			}),
		).rejects.toMatchObject({ code: 11000 });
	});

	it("numbers invoices with no gaps: a forced failure after numbering leaves the counter unmoved", async () => {
		const payload = world({ "commission-lines": [chargeLine()] });
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "commission-invoices";

		await expect(issueInvoicesForWeek(payload, NOW)).rejects.toThrow();
		expect(invoicesOf(payload)).toHaveLength(0);

		payload.failWhen = null;
		const result = await issueInvoicesForWeek(payload, NOW);
		const invoice = invoicesOf(payload)[0];
		// The sequence counter rolled back with the rest of the failed
		// transaction, so the retry gets the FIRST number, not the second.
		expect(invoice.invoiceNumber).toBe("BNS-C-2026-000001");
		expect(result.issued).toEqual([invoice.id]);
	});
});

describe("a protected order's commission: out of the weekly run, invoiced paid at completed", () => {
	const COMPLETED_AT = "2026-09-16T10:00:00.000Z";
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
	});
	afterEach(() => vi.useRealTimers());

	/** A mobile-money order of 47 000: commission 3 153 HT + 607 VAT, kept whole. */
	function protectedWorld() {
		return world({
			orders: [
				{ id: "o-1", orderNumber: "BNS-2609-000001" },
				{
					id: "o-2",
					orderNumber: "BNS-2609-000002",
					shop: "s-1",
					status: "completed",
					paymentMethod: "mobile_money",
					amounts: { currency: "XAF", commission: 3_153, commissionVat: 607 },
					timestamps: { completedAt: COMPLETED_AT },
				},
			],
			"commission-lines": [
				chargeLine(),
				chargeLine({
					id: "cl-mm",
					order: "o-2",
					paymentMethod: "mobile_money",
					baseAmount: 45_000,
					amount: 3_153,
				}),
			],
		});
	}

	async function complete(payload: FakePayload) {
		await withTransaction(payload, (req) =>
			postLedger(req, {
				kind: "commission_earned",
				occurredAt: COMPLETED_AT,
				sourceType: "order-event",
				sourceId: "oe-completed",
				currency: "XAF",
				order: "o-2",
				shop: "s-1",
				entries: postingFor("commission_earned", {
					commission: 3_153,
					commissionVat: 607,
				}),
			}),
		);
		const order = payload.store.orders.find((o) => o.id === "o-2");
		return withTransaction(payload, (req) =>
			issueApplicationFeeCommissionInvoice(req, order as unknown as Order),
		);
	}

	it("leaves the mobile_money line out of the weekly invoice and invoices it alone, already paid", async () => {
		const payload = protectedWorld();
		const week = await issueInvoicesForWeek(payload, NOW);
		const weekly = invoicesOf(payload).find((i) => i.id === week.issued[0]);
		expect({
			lines: weekly?.lines,
			commissionTotal: weekly?.commissionTotal,
		}).toEqual({ lines: ["cl-1"], commissionTotal: 3_600 });
		expect(linesOf(payload).find((l) => l.id === "cl-mm")?.status).toBe("open");

		vi.setSystemTime(new Date("2026-09-23T09:00:00.000Z"));
		const paid = await complete(payload);

		expect(invoicesOf(payload)).toHaveLength(2);
		const stored = invoicesOf(payload).find((i) => i.id === paid?.id);
		expect({
			invoiceNumber: stored?.invoiceNumber,
			settlement: stored?.settlement,
			status: stored?.status,
			lines: stored?.lines,
			ordersCount: stored?.ordersCount,
			commissionTotal: stored?.commissionTotal,
			vatAmount: stored?.vatAmount,
			totalDue: stored?.totalDue,
			periodStart: stored?.periodStart,
			paidAt: stored?.paidAt,
		}).toEqual({
			invoiceNumber: "BNS-C-2026-000002",
			settlement: "application_fee",
			status: "paid",
			lines: ["cl-mm"],
			ordersCount: 1,
			commissionTotal: 3_153,
			vatAmount: 607,
			totalDue: 3_760,
			periodStart: COMPLETED_AT,
			paidAt: "2026-09-23T09:00:00.000Z",
		});
		expect(linesOf(payload).find((l) => l.id === "cl-mm")).toMatchObject({
			status: "invoiced",
			invoice: paid?.id,
		});
	});

	it("issues one invoice per order however often the completed handler retries", async () => {
		const payload = protectedWorld();
		const first = await complete(payload);
		const order = payload.store.orders.find((o) => o.id === "o-2");
		const retry = await withTransaction(payload, (req) =>
			issueApplicationFeeCommissionInvoice(req, order as unknown as Order),
		);

		expect(
			invoicesOf(payload).filter((i) => i.settlement === "application_fee"),
		).toHaveLength(1);
		expect([first?.invoiceNumber, retry?.invoiceNumber]).toEqual([
			"BNS-C-2026-000001",
			"BNS-C-2026-000001",
		]);
	});

	it("invoices nothing when no commission was earned", async () => {
		const payload = protectedWorld();
		const order = payload.store.orders.find((o) => o.id === "o-2");
		const none = await withTransaction(payload, (req) =>
			issueApplicationFeeCommissionInvoice(req, order as unknown as Order),
		);
		expect(none).toBeNull();
		expect(invoicesOf(payload)).toHaveLength(0);
	});
});

describe("enforceOverdue", () => {
	function invoiceWorld(invoiceOverrides: Doc) {
		return world({
			"commission-invoices": [
				{
					id: "inv-1",
					invoiceNumber: "BNS-C-2026-000001",
					shop: "s-1",
					status: "issued",
					totalDue: 4_293,
					...invoiceOverrides,
				},
			],
		});
	}

	it("marks an invoice overdue past dueAt", async () => {
		const dueAt = new Date(NOW.getTime() - DAY_MS).toISOString();
		const payload = invoiceWorld({ dueAt });

		const result = await enforceOverdue(payload, NOW);

		expect(result.marked).toEqual(["inv-1"]);
		expect(invoicesOf(payload)[0].status).toBe("overdue");
	});

	it("sends the due-soon reminder at dueAt - 2d, once", async () => {
		const dueAt = new Date(NOW.getTime() + DAY_MS).toISOString(); // 1d away: inside the 2d window
		const payload = invoiceWorld({ dueAt });

		await enforceOverdue(payload, NOW);
		await enforceOverdue(payload, NOW); // replayed at the same instant

		expect(payload.logger.info).toHaveBeenCalledTimes(1);
		expect(invoicesOf(payload)[0].dueSoonReminderSentAt).toBe(
			NOW.toISOString(),
		);
		expect(invoicesOf(payload)[0].status).toBe("issued"); // not yet due
	});

	it("restricts the shop after three days overdue", async () => {
		const dueAt = new Date(NOW.getTime() - 3 * DAY_MS).toISOString();
		const payload = invoiceWorld({ status: "overdue", dueAt });

		const result = await enforceOverdue(payload, NOW);

		expect(result.restricted).toEqual(["s-1"]);
		expect(shopOf(payload).ordersRestrictedReason).toBe("commission_overdue");
		expect(invoicesOf(payload)[0].restrictedAt).toBeTruthy();
	});

	it("reports the shop after thirty days overdue", async () => {
		const dueAt = new Date(NOW.getTime() - 30 * DAY_MS).toISOString();
		const payload = invoiceWorld({ status: "overdue", dueAt });

		const result = await enforceOverdue(payload, NOW);

		expect(result.reported).toEqual(["inv-1"]);
		expect(payload.logger.error).toHaveBeenCalled();
	});
});

describe("payInvoice", () => {
	const owner = {
		id: "u-owner",
		role: null,
		name: null,
		email: null,
		suspendedAt: null,
		suspendedUntil: null,
	};

	// Only money still owed is payable. `waived` and `void` were written off
	// by the platform; before this guard the only refused status was `paid`,
	// so a seller could settle a debt that no longer existed.
	it.each([
		["waived"],
		["void"],
	])("refuses to take money against a %s invoice", async (status) => {
		const payload = fakePayload({
			shops: [shop()],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
				},
			],
			"commission-invoices": [
				{
					id: "inv-1",
					shop: "s-1",
					status,
					totalDue: 4_293,
					invoiceNumber: "BNS-C-2026-000001",
				},
			],
		});

		await expect(
			payInvoice(payload, owner, "inv-1", NOW),
		).rejects.toMatchObject({ code: "commission.notPayable", status: 409 });
		// Nothing was created on the way to the refusal.
		expect(payload.store["payment-intents"] ?? []).toHaveLength(0);
	});

	it("still answers alreadyPaid for a paid invoice", async () => {
		const payload = fakePayload({
			shops: [shop()],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
				},
			],
			"commission-invoices": [
				{ id: "inv-1", shop: "s-1", status: "paid", totalDue: 4_293 },
			],
		});

		await expect(
			payInvoice(payload, owner, "inv-1", NOW),
		).rejects.toMatchObject({ code: "commission.alreadyPaid" });
	});
});

describe("applyCommissionSettlement", () => {
	it("marks the invoice paid and lifts the restriction only when no other invoice is overdue", async () => {
		const payload = world({
			shops: [
				shop({
					ordersRestrictedAt: NOW.toISOString(),
					ordersRestrictedReason: "commission_overdue",
				}),
			],
			"commission-invoices": [
				{
					id: "inv-1",
					invoiceNumber: "BNS-C-2026-000001",
					shop: "s-1",
					status: "issued",
					totalDue: 4_293,
				},
			],
		});

		await applyCommissionSettlement(payload, intent());

		expect(invoicesOf(payload)[0]).toMatchObject({ status: "paid" });
		expect(shopOf(payload).ordersRestrictedAt).toBeNull();
	});

	it("leaves the restriction when another invoice is still overdue", async () => {
		const payload = world({
			shops: [
				shop({
					ordersRestrictedAt: NOW.toISOString(),
					ordersRestrictedReason: "commission_overdue",
				}),
			],
			"commission-invoices": [
				{
					id: "inv-1",
					invoiceNumber: "BNS-C-2026-000001",
					shop: "s-1",
					status: "issued",
					totalDue: 4_293,
				},
				{
					id: "inv-2",
					invoiceNumber: "BNS-C-2026-000002",
					shop: "s-1",
					status: "overdue",
					totalDue: 1_000,
				},
			],
		});

		await applyCommissionSettlement(payload, intent());

		expect(invoicesOf(payload)[0].status).toBe("paid");
		expect(shopOf(payload).ordersRestrictedAt).not.toBeNull();
	});
});

describe("waiveInvoice", () => {
	const moderator: Actor = { id: "u-staff", role: "moderator" };

	it("writes a ModerationLog entry with the order numbers in the same transaction", async () => {
		const payload = world({
			"commission-invoices": [
				{
					id: "inv-1",
					invoiceNumber: "BNS-C-2026-000001",
					shop: "s-1",
					status: "issued",
					totalDue: 3_600,
					lines: ["cl-1"],
				},
			],
			"commission-lines": [chargeLine()],
			"moderation-log": [],
		});

		await waiveInvoice(payload, moderator, "inv-1", "goodwill waiver");

		expect(invoicesOf(payload)[0]).toMatchObject({
			status: "waived",
			waivedBy: "u-staff",
			waivedNote: "goodwill waiver",
		});
		expect(linesOf(payload)[0].status).toBe("waived");
		expect(payload.store["moderation-log"]).toHaveLength(1);
		expect(payload.store["moderation-log"][0]).toMatchObject({
			action: "commission.waive",
			targetType: "commission-invoice",
			targetId: "inv-1",
			metadata: { orderNumbers: ["BNS-2609-000001"] },
		});
	});

	it("refuses a non-staff actor", async () => {
		const payload = world({
			"commission-invoices": [
				{
					id: "inv-1",
					invoiceNumber: "BNS-C-2026-000001",
					shop: "s-1",
					status: "issued",
				},
			],
		});

		await expect(
			waiveInvoice(payload, { id: "u-1", role: "user" }, "inv-1", "note"),
		).rejects.toMatchObject({ code: "moderation.forbidden" });
	});
});

describe("issueCommissionCredit", () => {
	// Lines accrue this week; the weekly run invoices them the week after.
	const NEXT_WEEK = new Date(NOW.getTime() + 7 * DAY_MS);
	const codOrder = (id: string) => ({
		id,
		orderNumber: `BNS-${id}`,
		paymentMethod: "cod",
	});
	const source = (refundedGoods: number, sourceId = "rc-1") => ({
		sourceType: "return-case" as const,
		sourceId,
		refundedGoods,
	});
	const credit = (
		payload: FakePayload,
		order: Doc,
		input: ReturnType<typeof source>,
	) =>
		withTransaction(payload, (req) =>
			issueCommissionCredit(
				req,
				{ ...input, order: order as unknown as Order },
				NOW,
			),
		);

	it("nets an uninvoiced charge on the same weekly invoice: 3 200 - 1 200 = 2 000 HT", async () => {
		const payload = world({
			orders: [codOrder("o-1")],
			"commission-lines": [chargeLine({ baseAmount: 40_000, amount: 3_200 })],
		});

		const line = await credit(payload, codOrder("o-1"), source(15_000));
		const result = await issueInvoicesForWeek(payload, NEXT_WEEK);

		expect(line).toMatchObject({
			kind: "credit",
			amount: 1_200,
			baseAmount: 15_000,
			sourceType: "return-case",
			sourceId: "rc-1",
			status: "open",
		});
		expect(invoicesOf(payload)).toHaveLength(1);
		expect(invoicesOf(payload)[0]).toMatchObject({
			id: result.issued[0],
			commissionTotal: 2_000,
			vatAmount: 385,
			totalDue: 2_385,
		});
		expect(invoicesOf(payload)[0].lines).toHaveLength(2);
	});

	it("a fully refunded COD order's weekly invoice carries the credit", async () => {
		const payload = world({
			orders: [codOrder("o-1"), codOrder("o-2")],
			"commission-lines": [
				chargeLine({ baseAmount: 45_000, amount: 3_600 }),
				chargeLine({
					id: "cl-2",
					order: "o-2",
					baseAmount: 40_000,
					amount: 3_200,
				}),
			],
		});

		await credit(payload, codOrder("o-1"), source(45_000));
		await issueInvoicesForWeek(payload, NEXT_WEEK);

		expect(linesOf(payload).filter((l) => l.kind === "credit")).toHaveLength(1);
		expect(invoicesOf(payload)[0]).toMatchObject({
			commissionTotal: 3_200,
			vatAmount: 616,
		});
		expect(linesOf(payload).find((l) => l.kind === "credit")).toMatchObject({
			amount: 3_600,
			status: "invoiced",
			invoice: invoicesOf(payload)[0].id,
		});
	});

	it("writes a series-A credit note against a paid invoice at that invoice's rate", async () => {
		const payload = world({
			orders: [codOrder("o-1")],
			"commission-invoices": [
				{
					id: "inv-1",
					invoiceNumber: "BNS-C-2026-000099",
					shop: "s-1",
					status: "paid",
					kind: "invoice",
					vatRateBps: 1_925,
				},
			],
			"commission-lines": [
				chargeLine({
					baseAmount: 40_000,
					amount: 3_200,
					status: "invoiced",
					invoice: "inv-1",
				}),
			],
		});

		await credit(payload, codOrder("o-1"), source(15_000));

		const note = invoicesOf(payload).find((i) => i.kind === "credit_note");
		const creditLine = linesOf(payload).find((l) => l.kind === "credit");
		expect(note).toMatchObject({
			kind: "credit_note",
			invoiceNumber: "BNS-A-2026-000001",
			creditsInvoice: "inv-1",
			sourceType: "return-case",
			sourceId: "rc-1",
			shop: "s-1",
			commissionTotal: 1_200,
			vatRateBps: 1_925,
			vatAmount: 231,
			lines: [creditLine?.id],
		});

		const next = await issueInvoicesForWeek(payload, NEXT_WEEK);
		expect(next.issued).toEqual([]);
		expect(next.netted).toHaveLength(1);
		expect(linesOf(payload).find((l) => l.kind === "credit")?.status).toBe(
			"invoiced",
		);
	});

	it("takes the VAT rate from the credited invoice, not from today's settings", async () => {
		const payload = world({
			orders: [codOrder("o-1")],
			"commission-invoices": [
				{
					id: "inv-1",
					invoiceNumber: "BNS-C-2026-000099",
					shop: "s-1",
					status: "issued",
					kind: "invoice",
					vatRateBps: 1_000,
				},
			],
			"commission-lines": [
				chargeLine({
					baseAmount: 40_000,
					amount: 3_200,
					status: "invoiced",
					invoice: "inv-1",
				}),
			],
		});

		await credit(payload, codOrder("o-1"), source(15_000));

		expect(
			invoicesOf(payload).find((i) => i.kind === "credit_note"),
		).toMatchObject({ vatRateBps: 1_000, vatAmount: 120 });
	});

	it("is idempotent per source and never credits past the charge", async () => {
		const payload = world({
			orders: [codOrder("o-1")],
			"commission-lines": [chargeLine({ baseAmount: 40_000, amount: 3_200 })],
		});

		await credit(payload, codOrder("o-1"), source(15_000));
		await credit(payload, codOrder("o-1"), source(15_000));
		expect(linesOf(payload).filter((l) => l.kind === "credit")).toHaveLength(1);

		await credit(payload, codOrder("o-1"), source(40_000, "rc-2"));
		const credits = linesOf(payload).filter((l) => l.kind === "credit");
		expect(credits.map((l) => l.amount)).toEqual([1_200, 2_000]);
	});

	it("leaves a protected order to P5's ledger", async () => {
		const payload = world({
			orders: [{ ...codOrder("o-1"), paymentMethod: "mobile_money" }],
			"commission-lines": [
				chargeLine({ paymentMethod: "mobile_money", baseAmount: 40_000 }),
			],
		});

		const line = await credit(
			payload,
			{ ...codOrder("o-1"), paymentMethod: "mobile_money" },
			source(40_000),
		);

		expect(line).toBeNull();
		expect(linesOf(payload).filter((l) => l.kind === "credit")).toHaveLength(0);
		expect(invoicesOf(payload)).toHaveLength(0);
	});
});
