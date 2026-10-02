// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OrderAudience } from "../../src/access/orderAccess";
import { can, SHOP_ROLES } from "../../src/access/shopRoles";
import type { Order, OrderEvent, OrderItem } from "../../src/payload-types";
import {
	serializeOrderForBuyer,
	serializeOrderForShop,
	serializeOrderForStaff,
	serializeOrderListEntry,
	visibleEvents,
} from "../../src/services/orders/serialize";

function makeOrder(overrides: Partial<Order> = {}): Order {
	return {
		id: "o-1",
		orderNumber: "ORD-1",
		buyer: "u-buyer",
		shop: "s-1",
		status: "placed",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: {
			recipientName: "Alice",
			phone: "+237600000012",
			city: "douala",
			district: "Akwa",
			landmark: "Blue gate",
			instructions: "Call before arriving",
		},
		amounts: {
			subtotal: 10_000,
			deliveryFee: 1_000,
			total: 11_000,
			currency: "XAF",
		},
		commission: { rateBps: 500, amount: 550, line: null },
		risk: {
			phoneTier: "regular",
			refusalsAtPlacement: 2,
			capsApplied: { shop: "orderTotal" },
		},
		timestamps: {},
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
	return {
		id: "oi-1",
		order: "o-1",
		product: "p-1",
		variant: "v-1",
		fulfillingShop: "s-1",
		snapshot: { title: "Phone case" },
		unitPrice: 5_000,
		quantity: 2,
		lineSubtotal: 10_000,
		commissionRateBps: 500,
		commissionAmount: 550,
		fulfillmentStatus: "unfulfilled",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function makeEvent(overrides: Partial<OrderEvent> = {}): OrderEvent {
	return {
		id: "oe-1",
		order: "o-1",
		type: "order.placed",
		visibility: "both",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

const order = () => makeOrder();
const items = () => [makeItem()];
const events = () => [makeEvent()];

/** Walks a serialised view and flags any key matching /hash/i or any 64-char hex value. */
function findHashLeak(value: unknown, path = ""): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string" && /^[0-9a-f]{64}$/i.test(value)) {
		return `${path} (64-char hex value)`;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			const hit = findHashLeak(value[i], `${path}[${i}]`);
			if (hit) return hit;
		}
		return null;
	}
	if (typeof value === "object") {
		for (const [key, inner] of Object.entries(
			value as Record<string, unknown>,
		)) {
			if (/hash/i.test(key)) return `${path}.${key}`;
			const hit = findHashLeak(inner, `${path}.${key}`);
			if (hit) return hit;
		}
	}
	return null;
}

describe("serializeOrderForBuyer: no commission, no risk, ever", () => {
	it('carries no "commission" key at all — omitted, not nulled', () => {
		const view = serializeOrderForBuyer(order(), items(), events());
		expect("commission" in view).toBe(false);
	});

	it('carries no "risk" key at all — the buyer must never learn they were scored', () => {
		const view = serializeOrderForBuyer(order(), items(), events());
		expect("risk" in view).toBe(false);
	});
});

describe("serializeOrderForShop: commission gated on the matrix", () => {
	it("a staff member's projection carries no commission field", () => {
		const view = serializeOrderForShop(order(), items(), events(), "staff");
		expect("commission" in view).toBe(false);
	});

	it("an owner's projection carries the commission field", () => {
		const view = serializeOrderForShop(order(), items(), events(), "owner");
		expect("commission" in view).toBe(true);
		expect(view.commission).toEqual({ rateBps: 500, amount: 550 });
	});

	it("a manager's projection carries the commission field", () => {
		const view = serializeOrderForShop(order(), items(), events(), "manager");
		expect("commission" in view).toBe(true);
	});

	it("gates commission on the matrix, not on a role string: every role's presence equals can(role, 'payments.view')", () => {
		for (const role of SHOP_ROLES) {
			const view = serializeOrderForShop(order(), items(), events(), role);
			expect("commission" in view).toBe(can(role, "payments.view"));
		}
	});

	it("gives every shop role the risk tier, never the raw counts", () => {
		for (const role of SHOP_ROLES) {
			const view = serializeOrderForShop(order(), items(), events(), role);
			expect(view.risk).toEqual({ phoneTier: "regular" });
			expect(view.risk && "refusalsAtPlacement" in view.risk).toBe(false);
			expect(view.risk && "capsApplied" in view.risk).toBe(false);
		}
	});
});

describe("serializeOrderForStaff: a moderator sees no commission either", () => {
	it('carries no "commission" key, whatever the raw collection field access allows', () => {
		const view = serializeOrderForStaff(order(), items(), events());
		expect("commission" in view).toBe(false);
	});
});

describe("no projection ever carries a hash", () => {
	const subject = makeOrder({
		confirmation: { codeHash: "a".repeat(64) },
		handover: { codeHash: "b".repeat(64) },
		contract: { snapshotHash: "c".repeat(64) },
	});

	it("walks every audience's view and finds no hash-like key or 64-char hex value", () => {
		const views: unknown[] = [
			serializeOrderForBuyer(subject, items(), events()),
			serializeOrderForShop(subject, items(), events(), "owner"),
			serializeOrderForShop(subject, items(), events(), "manager"),
			serializeOrderForShop(subject, items(), events(), "staff"),
			serializeOrderForStaff(subject, items(), events()),
			serializeOrderListEntry(subject),
		];
		for (const view of views) {
			expect(findHashLeak(view)).toBeNull();
		}
	});
});

describe("delivery phone: full while live, masked thirty days after terminal", () => {
	const cancelledAt = "2026-01-01T00:00:00.000Z";
	const subject = makeOrder({
		status: "cancelled",
		timestamps: { cancelledAt },
	});

	it("the shop sees the phone in full while the order is live (no terminal timestamp)", () => {
		const live = makeOrder({ status: "placed", timestamps: {} });
		const view = serializeOrderForShop(live, items(), events(), "owner");
		expect(view.delivery.phone).toBe("+237600000012");
	});

	it("the shop sees the phone in full at 29 days past terminal", () => {
		const now = new Date("2026-01-30T00:00:00.000Z"); // 29 days after cancelledAt
		const view = serializeOrderForShop(subject, items(), events(), "owner", {
			now,
		});
		expect(view.delivery.phone).toBe("+237600000012");
	});

	it("the shop sees the phone masked at exactly 30 days past terminal", () => {
		const now = new Date("2026-01-31T00:00:00.000Z"); // 30 days after cancelledAt
		const view = serializeOrderForShop(subject, items(), events(), "owner", {
			now,
		});
		expect(view.delivery.phone).toBe("+2376••••••12");
	});

	it("the shop sees the phone masked at 31 days past terminal", () => {
		const now = new Date("2026-02-01T00:00:00.000Z"); // 31 days after cancelledAt
		const view = serializeOrderForShop(subject, items(), events(), "owner", {
			now,
		});
		expect(view.delivery.phone).toBe("+2376••••••12");
	});

	it("never mutates the order's stored phone value (A7)", () => {
		const now = new Date("2026-02-01T00:00:00.000Z");
		serializeOrderForShop(subject, items(), events(), "owner", { now });
		expect(subject.delivery.phone).toBe("+237600000012");
	});

	it("the buyer always sees their own number in full, whatever the order's age", () => {
		const now = new Date("2026-02-01T00:00:00.000Z");
		const view = serializeOrderForBuyer(subject, items(), events(), { now });
		expect(view.delivery.phone).toBe("+237600000012");
	});
});

describe("the timeline: visibility filtered per audience", () => {
	const buyerOnly = makeEvent({ id: "e-buyer", visibility: "buyer" });
	const shopOnly = makeEvent({ id: "e-shop", visibility: "shop" });
	const both = makeEvent({ id: "e-both", visibility: "both" });
	const staffOnly = makeEvent({ id: "e-staff", visibility: "staff" });
	const all = [buyerOnly, shopOnly, both, staffOnly];

	const idsOf = (views: { id: string }[]) => views.map((v) => v.id).sort();

	it("shows a buyer only buyer-and-both events", () => {
		const audience: OrderAudience = { kind: "buyer" };
		expect(idsOf(visibleEvents(audience, all))).toEqual(["e-both", "e-buyer"]);
	});

	it("shows a shop member only shop-and-both events", () => {
		const audience: OrderAudience = { kind: "shop", role: "owner" };
		expect(idsOf(visibleEvents(audience, all))).toEqual(["e-both", "e-shop"]);
	});

	it("reaches staff-visibility events for staff alone", () => {
		const buyerAudience: OrderAudience = { kind: "buyer" };
		const shopAudience: OrderAudience = { kind: "shop", role: "staff" };
		const staffAudience: OrderAudience = { kind: "staff" };
		expect(idsOf(visibleEvents(buyerAudience, all))).not.toContain("e-staff");
		expect(idsOf(visibleEvents(shopAudience, all))).not.toContain("e-staff");
		expect(idsOf(visibleEvents(staffAudience, all))).toContain("e-staff");
	});

	it("gives staff the full timeline, every visibility", () => {
		const audience: OrderAudience = { kind: "staff" };
		expect(idsOf(visibleEvents(audience, all))).toEqual([
			"e-both",
			"e-buyer",
			"e-shop",
			"e-staff",
		]);
	});
});
