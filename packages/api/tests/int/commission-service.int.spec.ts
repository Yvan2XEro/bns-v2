// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../src/lib/transactions";
import type { Order, OrderItem } from "../../src/payload-types";
import { accrueCommission } from "../../src/services/commission";
import { runOrderEventHandlers } from "../../src/services/orders/events";
import { visibleEvents } from "../../src/services/orders/serialize";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

function order(overrides: Partial<Order> = {}): Order {
	return {
		id: "o-1",
		orderNumber: "BNS-2609-000001",
		shop: "s-1",
		status: "delivered",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: { recipientName: "Aicha", phone: "+237600000000" },
		createdAt: "2026-09-15T00:00:00.000Z",
		updatedAt: "2026-09-15T00:00:00.000Z",
		...overrides,
	};
}

function item(overrides: Partial<OrderItem> = {}): OrderItem {
	return {
		id: "oi-1",
		order: "o-1",
		product: "p-1",
		variant: "v-1",
		fulfillingShop: "s-1",
		snapshot: { title: "Phone", categoryId: null },
		unitPrice: 45_000,
		quantity: 1,
		lineSubtotal: 45_000,
		commissionRateBps: 800,
		fulfillmentStatus: "delivered",
		createdAt: "2026-09-15T00:00:00.000Z",
		updatedAt: "2026-09-15T00:00:00.000Z",
		...overrides,
	};
}

/** Compound key on (order, kind): a close enough stand-in for the real
 * partial index (Task 6) since every test here only ever creates a single
 * "charge" line per order. */
function world(seed: Record<string, unknown[]> = {}) {
	return fakePayload(
		{
			shops: [
				{
					id: "s-1",
					name: "Shop",
					handle: "shop",
					owner: "u-1",
					status: "active",
				},
			],
			orders: [order() as unknown as Doc],
			"order-items": [item() as unknown as Doc],
			categories: [],
			"commission-lines": [],
			...seed,
		},
		{ uniques: { "commission-lines": [["order", "kind"]] } },
	);
}

const linesOf = (p: FakePayload) => p.store["commission-lines"];
const orderOf = (p: FakePayload) => p.store.orders[0] as unknown as Order;
const itemsOf = (p: FakePayload) =>
	p.store["order-items"] as unknown as OrderItem[];
const eventsOf = (p: FakePayload) => p.store["order-events"];

describe("accrueCommission", () => {
	it("accrues one charge line on delivery, with the item subtotal as the base", async () => {
		const payload = world();
		const line = await withTransaction(payload, (req) =>
			accrueCommission(req, orderOf(payload), itemsOf(payload)),
		);

		expect(line).toMatchObject({
			baseAmount: 45_000,
			amount: 3_600,
			paymentMethod: "cod",
			status: "open",
		});
		expect(orderOf(payload).commission).toMatchObject({
			rateBps: 800,
			amount: 3_600,
		});
	});

	it("writes order.commission_accrued with shop visibility, hidden from the buyer's timeline", async () => {
		const payload = world();
		await withTransaction(payload, (req) =>
			accrueCommission(req, orderOf(payload), itemsOf(payload)),
		);

		const events = eventsOf(payload) as Array<{
			type: string;
			visibility: string;
		}>;
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "order.commission_accrued",
			visibility: "shop",
		});

		// This is the real guard: a buyer-audience filter must drop a
		// "shop"-visibility event. A test that only checked `visibility` on
		// the written row would miss a regression in `eventVisibilitiesFor`
		// itself.
		const forBuyer = visibleEvents(
			{ kind: "buyer" },
			events as unknown as Parameters<typeof visibleEvents>[1],
		);
		expect(forBuyer).toHaveLength(0);
	});

	it("accrues nothing twice for the same order: the second call returns the existing line and writes nothing", async () => {
		const payload = world();
		const first = await withTransaction(payload, (req) =>
			accrueCommission(req, orderOf(payload), itemsOf(payload)),
		);
		const second = await withTransaction(payload, (req) =>
			accrueCommission(req, orderOf(payload), itemsOf(payload)),
		);

		expect(second?.id).toBe(first?.id);
		expect(linesOf(payload)).toHaveLength(1);
	});

	it("the unique index refuses a hand-made duplicate charge line directly", async () => {
		const payload = world();
		await payload.create({
			collection: "commission-lines",
			data: {
				shop: "s-1",
				order: "o-1",
				kind: "charge",
				amount: 1,
				status: "open",
			},
		});

		await expect(
			payload.create({
				collection: "commission-lines",
				data: {
					shop: "s-1",
					order: "o-1",
					kind: "charge",
					amount: 2,
					status: "open",
				},
			}),
		).rejects.toMatchObject({ code: 11000 });
	});

	it.each([
		"cancelled",
		"delivery_failed",
	] as const)("accrues nothing for a %s order", async (status) => {
		const payload = world({ orders: [order({ status })] });
		const line = await withTransaction(payload, (req) =>
			accrueCommission(req, orderOf(payload), itemsOf(payload)),
		);

		expect(line).toBeNull();
		expect(linesOf(payload)).toHaveLength(0);
	});

	it("uses the category rate when the category has one", async () => {
		const payload = world({
			categories: [{ id: "cat-1", commissionRateBps: 500 }],
			"order-items": [item({ snapshot: { categoryId: "cat-1" } })],
		});
		const line = await withTransaction(payload, (req) =>
			accrueCommission(req, orderOf(payload), itemsOf(payload)),
		);

		expect(line?.amount).toBe(2_250); // commissionForLine(45_000, 500)
		expect(orderOf(payload).commission).toMatchObject({ rateBps: 500 });
	});

	it("falls back to the item's own rate when the category has none", async () => {
		const payload = world({
			categories: [{ id: "cat-1" }], // no commissionRateBps on the category
			"order-items": [item({ snapshot: { categoryId: "cat-1" } })],
		});
		const line = await withTransaction(payload, (req) =>
			accrueCommission(req, orderOf(payload), itemsOf(payload)),
		);

		expect(line?.amount).toBe(3_600); // the item's own 800 bps
	});
});

describe("the order.delivered registry wiring (importing services/commission registers the handler)", () => {
	it("a retried delivery dispatch accrues one commission line, not two", async () => {
		const payload = world();
		const deliveredOrder = orderOf(payload);

		// Two separate "mark delivered" dispatches — distinct event rows, as a
		// real replay that each committed its own transaction would produce —
		// both routed through the registry rather than called directly. This
		// is the scenario Review Focus 4 and the brief both name: whichever
		// guard catches it, exactly one line must exist afterwards.
		await runOrderEventHandlers(payload, deliveredOrder, {
			id: "ev-1",
			order: "o-1",
			type: "order.delivered",
			visibility: "both",
			createdAt: "2026-09-15T00:00:00.000Z",
			updatedAt: "2026-09-15T00:00:00.000Z",
		});
		await runOrderEventHandlers(payload, deliveredOrder, {
			id: "ev-2",
			order: "o-1",
			type: "order.delivered",
			visibility: "both",
			createdAt: "2026-09-15T00:00:01.000Z",
			updatedAt: "2026-09-15T00:00:01.000Z",
		});

		expect(linesOf(payload).filter((l) => l.kind === "charge")).toHaveLength(1);
	});
});
