// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../src/lib/transactions";
import type { Order } from "../../src/payload-types";
import {
	appendOrderEvent,
	applyTransition,
	assertNoSecretsInMetadata,
	assertTransition,
	FULFILLMENT_TRANSITIONS,
	type FulfillmentStatus,
	ORDER_STATUS_NAMES,
	type OrderStatus,
	PAYMENT_TRANSITIONS,
	type PaymentStatus,
	RESERVED_TRANSITION_CONTEXT,
	STATUS_TRANSITIONS,
	TERMINAL_STATUSES,
	type TransitionEventInput,
} from "../../src/services/orders/transitions";
import { type Doc, fakePayload } from "./helpers/fakePayload";

function isOrder(value: unknown): value is Order {
	return (
		typeof value === "object" &&
		value !== null &&
		"status" in value &&
		"paymentStatus" in value
	);
}

type SeedOrder = Partial<Order> & { id?: string; status?: OrderStatus };
type SeedItem = Doc;

const DEFAULT_ITEMS: SeedItem[] = [
	{
		id: "oi-1",
		order: "o-1",
		product: "p-1",
		variant: "v-1",
		fulfillingShop: "s-1",
		unitPrice: 1000,
		quantity: 1,
		fulfillmentStatus: "unfulfilled",
	},
	{
		id: "oi-2",
		order: "o-1",
		product: "p-1",
		variant: "v-1",
		fulfillingShop: "s-1",
		unitPrice: 1000,
		quantity: 1,
		fulfillmentStatus: "unfulfilled",
	},
];

function seedOrder(
	overrides: SeedOrder = {},
	items: SeedItem[] = DEFAULT_ITEMS,
) {
	return fakePayload({
		orders: [
			{
				id: "o-1",
				orderNumber: "ON-1",
				shop: "s-1",
				status: "accepted",
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				delivery: { recipientName: "Aïcha", phone: "+237600000000" },
				...overrides,
			},
		],
		"order-items": items,
		"order-events": [],
	});
}

/**
 * A clone, never the live row: `fakePayload`'s own `findByID` always returns
 * one (mirroring the real Local API), and the concurrency tests below rely
 * on it — the whole point of "two writers deciding against the same
 * observed state" is that neither one's copy moves when the other's write
 * lands.
 */
function orderOf(payload: ReturnType<typeof seedOrder>): Order {
	const raw = payload.store.orders[0];
	if (!isOrder(raw)) throw new Error("test fixture: no order seeded");
	return structuredClone(raw);
}

const event = (
	overrides: Partial<TransitionEventInput> = {},
): TransitionEventInput => ({
	type: "order.note_added",
	visibility: "staff",
	...overrides,
});

describe("STATUS_TRANSITIONS", () => {
	/** The spec's status table, transcribed. Row order is the spec's row order. */
	const ALLOWED: Array<[OrderStatus | "none", OrderStatus]> = [
		["none", "placed"],
		["placed", "confirmed"],
		["placed", "paid"],
		["placed", "cancelled"],
		["confirmed", "accepted"],
		["confirmed", "cancelled"],
		["paid", "accepted"],
		["paid", "cancelled"],
		["accepted", "shipped"],
		["accepted", "cancelled"],
		["shipped", "delivered"],
		["shipped", "delivery_failed"],
		["shipped", "cancelled"],
		["shipped", "disputed"],
		["delivered", "completed"],
		["delivered", "returned"],
		["delivered", "disputed"],
		["disputed", "shipped"],
		["disputed", "delivered"],
		["disputed", "returned"],
		["disputed", "cancelled"],
	];

	it("allows exactly the spec's twenty-one status transitions and no others", () => {
		const froms: Array<OrderStatus | "none"> = ["none", ...ORDER_STATUS_NAMES];
		for (const from of froms) {
			for (const to of ORDER_STATUS_NAMES) {
				const allowed = ALLOWED.some(([f, t]) => f === from && t === to);
				expect([from, to, STATUS_TRANSITIONS[from].includes(to)]).toEqual([
					from,
					to,
					allowed,
				]);
			}
		}
		expect(ALLOWED).toHaveLength(21);
	});

	it("leaves every terminal status with no way out except P6's", () => {
		expect(STATUS_TRANSITIONS.completed).toEqual([]);
		expect(STATUS_TRANSITIONS.cancelled).toEqual([]);
		expect(STATUS_TRANSITIONS.delivery_failed).toEqual([]);
		expect(STATUS_TRANSITIONS.returned).toEqual([]);
		expect(TERMINAL_STATUSES).toEqual([
			"completed",
			"cancelled",
			"delivery_failed",
			"returned",
		]);
	});
});

describe("PAYMENT_TRANSITIONS and FULFILLMENT_TRANSITIONS", () => {
	it("terminates payment status at cod_refused, refunded and failed", () => {
		const terminal: PaymentStatus[] = ["cod_refused", "refunded", "failed"];
		for (const status of terminal) {
			expect(PAYMENT_TRANSITIONS[status]).toEqual([]);
		}
	});

	it("terminates item fulfilment at failed, cancelled and returned", () => {
		const terminal: FulfillmentStatus[] = ["failed", "cancelled", "returned"];
		for (const status of terminal) {
			expect(FULFILLMENT_TRANSITIONS[status]).toEqual([]);
		}
	});
});

describe("assertTransition", () => {
	it("throws order.invalidTransition for a pair the table does not list", () => {
		expect.assertions(1);
		try {
			assertTransition<OrderStatus>(
				"completed",
				"cancelled",
				STATUS_TRANSITIONS,
			);
		} catch (error) {
			expect(error).toMatchObject({ code: "order.invalidTransition" });
		}
	});

	it("is silent for a pair the table lists", () => {
		expect(() =>
			assertTransition<OrderStatus>("accepted", "shipped", STATUS_TRANSITIONS),
		).not.toThrow();
	});
});

describe("applyTransition", () => {
	it("writes the order, the items and the event in the caller's transaction", async () => {
		const payload = seedOrder({ status: "accepted" });
		await withTransaction(payload, (req) =>
			applyTransition(
				req,
				orderOf(payload),
				{ status: "shipped", items: { ids: ["oi-1", "oi-2"], to: "shipped" } },
				event({ type: "order.shipped", visibility: "both" }),
			),
		);
		expect(payload.writes).toHaveLength(4);
		const transactionIDs = new Set(payload.writes.map((w) => w.transactionID));
		expect(transactionIDs.size).toBe(1);
	});

	it("refuses a forbidden status change with order.invalidTransition and writes nothing", async () => {
		const payload = seedOrder({ status: "completed" });
		await expect(
			withTransaction(payload, (req) =>
				applyTransition(
					req,
					orderOf(payload),
					{ status: "cancelled" },
					event({ type: "order.cancelled", visibility: "both" }),
				),
			),
		).rejects.toMatchObject({ code: "order.invalidTransition" });
		expect(payload.writes).toHaveLength(0);
	});

	it("refuses a P5 status from a P4 actor, and allows it with the P5 context flag", async () => {
		const payload = seedOrder({ status: "placed" });
		await expect(
			withTransaction(payload, (req) =>
				applyTransition(
					req,
					orderOf(payload),
					{ status: "paid" },
					event({
						type: "order.confirmed",
						actorType: "seller",
						visibility: "both",
					}),
				),
			),
		).rejects.toMatchObject({ code: "order.invalidTransition" });

		const payload2 = seedOrder({ status: "placed" });
		await withTransaction(
			payload2,
			(req) =>
				applyTransition(
					req,
					orderOf(payload2),
					{ status: "paid" },
					event({ type: "order.confirmed", visibility: "both" }),
				),
			{ context: { ...RESERVED_TRANSITION_CONTEXT } },
		);
		expect(payload2.store.orders[0]?.status).toBe("paid");
	});

	it("refuses an item fulfilment change the item's own table forbids", async () => {
		const payload = seedOrder({ status: "delivered" }, [
			{ id: "oi-1", order: "o-1", fulfillmentStatus: "delivered" },
		]);
		await expect(
			withTransaction(payload, (req) =>
				applyTransition(
					req,
					orderOf(payload),
					{ items: { ids: ["oi-1"], to: "shipped" } },
					event(),
				),
			),
		).rejects.toMatchObject({ code: "order.invalidTransition" });
	});

	it("moves only the items it was given", async () => {
		const payload = seedOrder({ status: "accepted" });
		await withTransaction(payload, (req) =>
			applyTransition(
				req,
				orderOf(payload),
				{ items: { ids: ["oi-1"], to: "shipped" } },
				event({ type: "order.shipped", visibility: "both" }),
			),
		);
		const items = payload.store["order-items"];
		expect(items.find((i) => i.id === "oi-1")?.fulfillmentStatus).toBe(
			"shipped",
		);
		expect(items.find((i) => i.id === "oi-2")?.fulfillmentStatus).toBe(
			"unfulfilled",
		);
	});

	it("refuses the second of two concurrent writers on the same order", async () => {
		const payload = seedOrder({ status: "accepted" });
		// Both actors decide against the same observed "accepted" order — a
		// snapshot taken once, before either transaction starts — exactly as
		// two members would each act on what they last saw on screen.
		const seen = orderOf(payload);
		const shipEvent = event({ type: "order.shipped", visibility: "both" });
		const cancelEvent = event({ type: "order.cancelled", visibility: "both" });
		const [a, b] = await Promise.allSettled([
			withTransaction(payload, (req) =>
				applyTransition(req, seen, { status: "shipped" }, shipEvent),
			),
			withTransaction(payload, (req) =>
				applyTransition(req, seen, { status: "cancelled" }, cancelEvent),
			),
		]);
		const outcomes = [a.status, b.status].sort();
		expect(outcomes).toEqual(["fulfilled", "rejected"]);
		const stored = payload.store.orders[0];
		expect(["shipped", "cancelled"]).toContain(stored?.status);
		expect(payload.store["order-events"]).toHaveLength(1);
	});

	it("tells the loser which state actually holds", async () => {
		const payload = seedOrder({ status: "accepted" });
		const seen = orderOf(payload);
		const shipEvent = event({ type: "order.shipped", visibility: "both" });
		const cancelEvent = event({ type: "order.cancelled", visibility: "both" });
		const [a, b] = await Promise.allSettled([
			withTransaction(payload, (req) =>
				applyTransition(req, seen, { status: "shipped" }, shipEvent),
			),
			withTransaction(payload, (req) =>
				applyTransition(req, seen, { status: "cancelled" }, cancelEvent),
			),
		]);
		const loser = a.status === "rejected" ? a : b;
		if (loser.status !== "rejected") throw new Error("expected a loser");
		const stored = payload.store.orders[0];
		expect(loser.reason).toMatchObject({ details: { status: stored?.status } });
	});

	it("never writes an event for a refused transition", async () => {
		// Structurally valid ("accepted" -> "cancelled" is in the table) but
		// refused at the write: someone else already moved the order to
		// "shipped" between this caller's read and its write. Deliberately
		// NOT wrapped in `withTransaction`: inside one, any throw rolls back
		// every write the attempt made regardless of order, which would hide
		// an event written before the refusal is noticed behind that
		// rollback. Calling `applyTransition` directly, the way a `req` with
		// no open transaction would, is the only way this test can tell "the
		// write never happens" apart from "the write happens and is undone".
		const payload = seedOrder({ status: "accepted" });
		const seen = orderOf(payload);
		const stale = payload.store.orders[0];
		if (stale) stale.status = "shipped";
		const req = { payload, context: {} } as unknown as PayloadRequest;
		await expect(
			applyTransition(
				req,
				seen,
				{ status: "cancelled" },
				event({ type: "order.cancelled", visibility: "both" }),
			),
		).rejects.toMatchObject({ code: "order.invalidTransition" });
		expect(payload.store["order-events"]).toHaveLength(0);
	});

	it("appends an event with no status change and keeps the order's status untouched", async () => {
		const payload = seedOrder({ status: "shipped" });
		await withTransaction(payload, (req) =>
			applyTransition(
				req,
				orderOf(payload),
				{},
				event({
					type: "order.note_added",
					note: "Called the buyer to confirm the address.",
				}),
			),
		);
		expect(payload.store.orders[0]?.status).toBe("shipped");
		expect(payload.store["order-events"]).toHaveLength(1);
		expect(payload.store["order-events"][0]?.type).toBe("order.note_added");
	});

	it("stores no code or hash in metadata", async () => {
		const payload = seedOrder({ status: "shipped" });
		await expect(
			withTransaction(payload, (req) =>
				applyTransition(
					req,
					orderOf(payload),
					{},
					event({ metadata: { code: "4242" } }),
				),
			),
		).rejects.toThrow(/code or hash/);
		expect(payload.store["order-events"]).toHaveLength(0);
	});
});

/** Every `src` file that creates an `order-events` row itself, as a path
 * relative to `src`. */
function orderEventWriters(): string[] {
	const root = fileURLToPath(new URL("../../src/", import.meta.url));
	const writes = /\.create\(\{\s*collection:\s*"order-events"/;
	return readdirSync(root, { recursive: true, encoding: "utf8" })
		.filter((path) => path.endsWith(".ts"))
		.filter((path) => writes.test(readFileSync(join(root, path), "utf8")))
		.sort();
}

describe("appendOrderEvent", () => {
	// Its no-secrets guard sits at the write itself, so it only holds while
	// no second call site creates an event directly.
	it("is the only code that creates an order event", () => {
		expect(orderEventWriters()).toEqual([
			join("services", "orders", "transitions.ts"),
		]);
	});

	it("also rejects a code or hash key when called directly", async () => {
		const payload = seedOrder({ status: "shipped" });
		await expect(
			withTransaction(payload, (req) =>
				appendOrderEvent(
					req,
					orderOf(payload),
					event({ metadata: { otpHash: "x" } }),
				),
			),
		).rejects.toThrow(/code or hash/);
	});
});

describe("assertNoSecretsInMetadata", () => {
	it("passes through anything that is not a plain object", () => {
		expect(() => assertNoSecretsInMetadata(null)).not.toThrow();
		expect(() => assertNoSecretsInMetadata(undefined)).not.toThrow();
		expect(() => assertNoSecretsInMetadata(["code"])).not.toThrow();
		expect(() => assertNoSecretsInMetadata("code")).not.toThrow();
	});

	it("rejects a key containing code, hash, secret or otp, case-insensitively", () => {
		for (const key of [
			"code",
			"Hash",
			"secretValue",
			"otpCode",
			"confirmationCode",
		]) {
			expect(() => assertNoSecretsInMetadata({ [key]: "x" })).toThrow();
		}
	});

	it("allows an unrelated key", () => {
		expect(() =>
			assertNoSecretsInMetadata({ reason: "buyer_changed_mind" }),
		).not.toThrow();
	});
});
