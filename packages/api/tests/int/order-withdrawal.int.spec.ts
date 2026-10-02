// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_STATUS_NAMES } from "../../src/lib/orderFormat";
import { __resetOrderEventHandlers } from "../../src/services/orders/events";
import { openWithdrawal } from "../../src/services/orders/withdrawal";
import { type Doc, fakePayload } from "./helpers/fakePayload";

const DELIVERED_AT = "2026-09-01T00:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;
const BUYER = { id: "u-buyer", role: "user" };

function baseOrder(overrides: Doc = {}): Doc {
	return {
		id: "order-1",
		orderNumber: "BNS-2609-000001",
		buyer: "u-buyer",
		shop: "s-1",
		status: "delivered",
		paymentMethod: "cod",
		paymentStatus: "cod_collected",
		delivery: { recipientName: "Aicha", phone: "+237699999999" },
		amounts: { total: 20000, currency: "XAF" },
		contract: { locale: "fr" },
		timestamps: { deliveredAt: DELIVERED_AT },
		completionHold: "none",
		returnCase: null,
		...overrides,
	};
}

function baseItems(): Doc[] {
	return [
		{
			id: "oi-1",
			order: "order-1",
			product: "p-1",
			variant: "v-1",
			fulfillingShop: "s-1",
			unitPrice: 10000,
			quantity: 2,
			fulfillmentStatus: "delivered",
		},
		{
			id: "oi-2",
			order: "order-1",
			product: "p-1",
			variant: "v-1",
			fulfillingShop: "s-1",
			unitPrice: 10000,
			quantity: 1,
			fulfillmentStatus: "delivered",
		},
	];
}

function seed(order: Doc, items: Doc[] = baseItems()) {
	return fakePayload({
		orders: [order],
		"order-items": items,
		"order-events": [],
		"return-cases": [],
	});
}

function itemsOf(payload: ReturnType<typeof fakePayload>): Doc[] {
	return payload.store["order-items"] ?? [];
}

function orderOf(payload: ReturnType<typeof fakePayload>): Doc {
	return (payload.store.orders ?? [])[0] ?? {};
}

const oneItem = (quantity = 1) => ({
	items: [{ orderItemId: "oi-1", quantity }],
});

beforeEach(() => {
	__resetOrderEventHandlers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("openWithdrawal", () => {
	it("opens a case numbered RET-YYMM-NNNNNN", async () => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder());

		const result = await openWithdrawal(payload, BUYER, "order-1", oneItem());

		expect(result.caseNumber).toMatch(/^RET-2609-\d{6}$/);
		expect(payload.store["return-cases"]).toHaveLength(1);
		expect(payload.store["return-cases"]?.[0]?.id).toBe(result.caseId);
		expect(payload.store["return-cases"]?.[0]?.number).toBe(result.caseNumber);
	});

	describe("the withdrawal window, computed from delivery", () => {
		it("opens a case on day 14 after delivery", async () => {
			vi.setSystemTime(
				new Date(new Date(DELIVERED_AT).getTime() + 14 * DAY_MS),
			);
			const payload = seed(baseOrder());

			await openWithdrawal(payload, BUYER, "order-1", oneItem());

			expect(payload.store["return-cases"]).toHaveLength(1);
		});

		it("still opens a case exactly on day 15, the inclusive boundary", async () => {
			vi.setSystemTime(
				new Date(new Date(DELIVERED_AT).getTime() + 15 * DAY_MS),
			);
			const payload = seed(baseOrder());

			await openWithdrawal(payload, BUYER, "order-1", oneItem());

			expect(payload.store["return-cases"]).toHaveLength(1);
		});

		it("refuses one millisecond past day 15 with order.withdrawalWindowClosed", async () => {
			vi.setSystemTime(
				new Date(new Date(DELIVERED_AT).getTime() + 15 * DAY_MS + 1),
			);
			const payload = seed(baseOrder());

			await expect(
				openWithdrawal(payload, BUYER, "order-1", oneItem()),
			).rejects.toMatchObject({ code: "order.withdrawalWindowClosed" });
			expect(payload.store["return-cases"]).toHaveLength(0);
		});
	});

	it("refuses a second open case with order.withdrawalAlreadyRequested, proven by counting rows rather than by the throw alone", async () => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder());

		await openWithdrawal(payload, BUYER, "order-1", oneItem());
		await expect(
			openWithdrawal(payload, BUYER, "order-1", {
				items: [{ orderItemId: "oi-2", quantity: 1 }],
			}),
		).rejects.toMatchObject({ code: "order.withdrawalAlreadyRequested" });

		expect(payload.store["return-cases"]).toHaveLength(1);
	});

	const NON_DELIVERED_STATUSES = ORDER_STATUS_NAMES.filter(
		(status) => status !== "delivered",
	);

	it.each(
		NON_DELIVERED_STATUSES,
	)("refuses an order with status %s", async (status) => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder({ status }));

		await expect(
			openWithdrawal(payload, BUYER, "order-1", oneItem()),
		).rejects.toMatchObject({ code: "order.invalidTransition" });
		expect(payload.store["return-cases"]).toHaveLength(0);
	});

	it("moves only the named items to return_requested", async () => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder());

		await openWithdrawal(payload, BUYER, "order-1", oneItem());

		const items = itemsOf(payload);
		expect(items.find((i) => i.id === "oi-1")?.fulfillmentStatus).toBe(
			"return_requested",
		);
		expect(items.find((i) => i.id === "oi-2")?.fulfillmentStatus).toBe(
			"delivered",
		);
	});

	it("refuses a quantity above the item's own quantity", async () => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder());

		await expect(
			openWithdrawal(payload, BUYER, "order-1", oneItem(3)),
		).rejects.toMatchObject({ code: "generic.validation" });

		expect(payload.store["return-cases"]).toHaveLength(0);
		expect(
			itemsOf(payload).find((i) => i.id === "oi-1")?.fulfillmentStatus,
		).toBe("delivered");
	});

	it("sets completionHold to return_case and links returnCase — the same field Task 27's auto-completion must see before closing the order", async () => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder());

		const result = await openWithdrawal(payload, BUYER, "order-1", oneItem());

		const order = orderOf(payload);
		expect(order.completionHold).toBe("return_case");
		expect(order.returnCase).toBe(result.caseId);
	});

	it("writes order.withdrawal_requested exactly once", async () => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder());

		await openWithdrawal(payload, BUYER, "order-1", oneItem());

		const events = (payload.store["order-events"] ?? []).filter(
			(event) => event.type === "order.withdrawal_requested",
		);
		expect(events).toHaveLength(1);
	});

	it("needs no reason (art. 20): an empty reasonText still opens the case", async () => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder());

		const result = await openWithdrawal(payload, BUYER, "order-1", oneItem());

		expect(result.caseId).toBeTruthy();
		const created = payload.store["return-cases"]?.find(
			(row) => row.id === result.caseId,
		);
		expect(created?.reasonText ?? null).toBeNull();
	});

	it("writes the case, the item move, the order fields and the event under one shared transactionID", async () => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder());

		await openWithdrawal(payload, BUYER, "order-1", oneItem());

		const transactionIds = new Set(
			payload.writes
				.filter((write) => write.collection !== "sequences")
				.map((write) => write.transactionID),
		);
		expect(transactionIds.size).toBe(1);
		expect([...transactionIds][0]).toBeTruthy();
	});

	it("a forced failure while writing the event leaves nothing behind", async () => {
		vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
		const payload = seed(baseOrder());
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "order-events";

		await expect(
			openWithdrawal(payload, BUYER, "order-1", oneItem()),
		).rejects.toThrow();

		expect(payload.store["return-cases"]).toHaveLength(0);
		expect(payload.store["order-events"]).toHaveLength(0);
		expect(
			itemsOf(payload).find((i) => i.id === "oi-1")?.fulfillmentStatus,
		).toBe("delivered");
		const order = orderOf(payload);
		expect(order.completionHold).toBe("none");
		expect(order.returnCase ?? null).toBeNull();
	});
});
