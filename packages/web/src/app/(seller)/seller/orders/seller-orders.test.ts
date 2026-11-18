import { describe, expect, test } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import { availableActions, type OrderAction } from "~/lib/order-actions";
import { ORDER_STATUSES } from "~/lib/order-status";
import type { ShopRole } from "~/types";
import type { OrderView } from "~/types/order";
import {
	DELIVERY_FAILURE_REASONS,
	handoverSchema,
	SELLER_END_REASONS,
	sellerEndSchema,
} from "./order-forms";
import {
	acceptCountdown,
	actionBarItems,
	EVENT_LABEL_KEYS,
	eventLabelKey,
	isShopOrderTab,
	mapsUrl,
	telHref,
	tierLabelKey,
} from "./seller-orders";
import { NOW, order } from "./seller-orders.fixture";

const ROLES: Array<ShopRole | null> = ["owner", "manager", "staff", null];

const items = (o: OrderView, role: ShopRole | null): OrderAction[] =>
	actionBarItems(o, role, NOW).map((item) => item.action);

describe("a live shipment hands its three actions to the shipment panel", () => {
	const names = (status: "accepted" | "shipped", live: boolean) =>
		actionBarItems(order({ status }), "owner", NOW, live).map(
			(item) => item.action,
		);

	test("hidden with a live shipment, unchanged without one", () => {
		expect(names("accepted", false)).toEqual([
			"ship",
			"seller_cancel",
			"receipt",
		]);
		expect(names("accepted", true)).toEqual(["seller_cancel", "receipt"]);
		expect(names("shipped", false)).toEqual([
			"handover",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		]);
		expect(names("shipped", true)).toEqual([
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		]);
	});
});

describe("the action bar renders exactly availableActions", () => {
	test("for every status and every role, in the table's order", () => {
		let cells = 0;
		for (const status of ORDER_STATUSES) {
			for (const role of ROLES) {
				const subject = order({ status });
				expect(items(subject, role)).toEqual(
					availableActions(subject, "shop", role, NOW),
				);
				cells += 1;
			}
		}
		expect(cells).toBe(44);
	});

	test("a staff member gets no seller_cancel on an accepted order, an owner does", () => {
		const accepted = order({ status: "accepted" });
		expect(items(accepted, "staff")).toEqual(["ship", "receipt"]);
		expect(items(accepted, "owner")).toEqual([
			"ship",
			"seller_cancel",
			"receipt",
		]);
	});

	test("a placed order offers the call confirmation, decline and cancel to a manager", () => {
		expect(items(order(), "manager")).toEqual([
			"confirm_by_call",
			"decline",
			"seller_cancel",
			"receipt",
		]);
	});

	test("a locked handover drops the code entry but keeps declare-delivered", () => {
		const locked = order({
			status: "shipped",
			handover: {
				method: null,
				locked: true,
				attemptsLeft: 0,
				regenerationsLeft: 3,
			},
		});
		expect(items(locked, "staff")).toEqual([
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		]);
	});

	test("an acceptance deadline in the past drops accept", () => {
		const late = order({
			status: "confirmed",
			deadlines: { ...order().deadlines, acceptBy: "2026-10-01T00:00:00Z" },
		});
		expect(items(late, "owner")).toEqual([
			"decline",
			"seller_cancel",
			"receipt",
		]);
	});

	test("every item carries a SellerOrders label that exists in both locales", () => {
		const shipped = actionBarItems(order({ status: "shipped" }), "owner", NOW);
		expect(shipped).toHaveLength(5);
		for (const item of shipped) {
			expect(typeof leaf(en, `SellerOrders.${item.labelKey}`)).toBe("string");
			expect(typeof leaf(fr, `SellerOrders.${item.labelKey}`)).toBe("string");
		}
	});
});

type Json = { [key: string]: Json | string };
function leaf(root: unknown, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(acc, part) =>
				acc && typeof acc === "object" ? (acc as Json)[part] : undefined,
			root,
		);
}

describe("the computed label families this screen picks at runtime", () => {
	test("the four seller end reasons, each labelled in both locales", () => {
		expect(SELLER_END_REASONS).toEqual([
			"seller_out_of_stock",
			"seller_cannot_deliver",
			"seller_buyer_unreachable",
			"seller_other",
		]);
		for (const reason of SELLER_END_REASONS) {
			expect(typeof leaf(en, `SellerOrders.reason_${reason}`)).toBe("string");
			expect(typeof leaf(fr, `SellerOrders.reason_${reason}`)).toBe("string");
		}
	});

	test("the six delivery failure reasons, labelled by OrderStatus", () => {
		expect(DELIVERY_FAILURE_REASONS).toHaveLength(6);
		for (const reason of DELIVERY_FAILURE_REASONS) {
			expect(typeof leaf(en, `OrderStatus.failure_${reason}`)).toBe("string");
			expect(typeof leaf(fr, `OrderStatus.failure_${reason}`)).toBe("string");
		}
	});

	test("all five tiers, including blocked", () => {
		const tiers = ["new", "regular", "trusted", "watch", "blocked"] as const;
		const keys = tiers.map(tierLabelKey);
		expect(new Set(keys).size).toBe(5);
		for (const key of keys) {
			expect(typeof leaf(en, `SellerOrders.${key}`)).toBe("string");
			expect(typeof leaf(fr, `SellerOrders.${key}`)).toBe("string");
		}
	});

	test("every timeline event label", () => {
		expect(EVENT_LABEL_KEYS).toHaveLength(22);
		for (const key of EVENT_LABEL_KEYS) {
			expect(typeof leaf(en, `SellerOrders.${key}`)).toBe("string");
			expect(typeof leaf(fr, `SellerOrders.${key}`)).toBe("string");
		}
		expect(eventLabelKey("order.handover_locked")).toBe(
			"event_handover_locked",
		);
		expect(eventLabelKey("order.paid")).toBe("event_other");
	});
});

describe("acceptCountdown", () => {
	test("hours and minutes left, rounded down", () => {
		expect(acceptCountdown("2026-10-03T08:30:59.000Z", NOW)).toEqual({
			expired: false,
			hours: 22,
			minutes: 30,
		});
	});

	test("expired once the deadline is reached", () => {
		expect(acceptCountdown("2026-10-02T10:00:00.000Z", NOW)).toEqual({
			expired: true,
		});
	});

	test("no deadline, no countdown", () => {
		expect(acceptCountdown(null, NOW)).toBeNull();
		expect(acceptCountdown(undefined, NOW)).toBeNull();
	});
});

describe("the buyer block's links", () => {
	test("Maps opens the GPS pin when there is one", () => {
		const delivery = {
			...order().delivery,
			gps: { lat: 4.0123, lng: 9.7, accuracyMeters: 12 },
		};
		expect(mapsUrl(delivery)).toBe(
			"https://www.google.com/maps/search/?api=1&query=4.0123,9.7",
		);
	});

	test("Maps falls back to the landmark, district and city", () => {
		expect(mapsUrl(order().delivery)).toBe(
			`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
				"Derrière la pharmacie, Bonapriso, douala, Cameroun",
			)}`,
		);
	});

	test("no pin and no landmark gives no link", () => {
		expect(mapsUrl({ ...order().delivery, landmark: null })).toBeNull();
	});

	test("the call button dials the number the API sent in full", () => {
		expect(telHref(order().delivery)).toBe("tel:+237690000000");
	});

	test("a masked number gets no call button", () => {
		expect(
			telHref({
				...order().delivery,
				phone: "+237 6•• •• •• 00",
				phoneMasked: true,
			}),
		).toBeNull();
	});
});

describe("the dialog forms", () => {
	test("seller_other is refused without a note, on the note field", () => {
		const result = sellerEndSchema.safeParse({
			reason: "seller_other",
			note: "  ",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
			"note",
		]);
	});

	test("seller_other with a note, and any other reason without one, pass", () => {
		expect(
			sellerEndSchema.safeParse({ reason: "seller_other", note: "Fermé" })
				.success,
		).toBe(true);
		expect(
			sellerEndSchema.safeParse({ reason: "seller_out_of_stock", note: "" })
				.success,
		).toBe(true);
	});

	test("a reason outside the API's four is refused", () => {
		expect(
			sellerEndSchema.safeParse({ reason: "buyer_changed_mind", note: "" })
				.success,
		).toBe(false);
	});

	test("the handover code is exactly four digits", () => {
		expect(handoverSchema.safeParse({ code: "0427" }).success).toBe(true);
		expect(handoverSchema.safeParse({ code: "427" }).success).toBe(false);
		expect(handoverSchema.safeParse({ code: "04a7" }).success).toBe(false);
	});

	test("only the six tabs are tabs", () => {
		expect(isShopOrderTab("to_ship")).toBe(true);
		expect(isShopOrderTab("returned")).toBe(false);
		expect(isShopOrderTab(undefined)).toBe(false);
	});
});
