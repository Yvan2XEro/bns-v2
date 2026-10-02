import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import type { OrderDeliveryView } from "../types/order";
import type { OrderActionSubject } from "./orderActions";
import type { OrderStatusName } from "./orderStatus";
import {
	acceptCountdown,
	actionBarItems,
	callHref,
	DELIVERY_FAILURE_REASON_KEYS,
	DELIVERY_FAILURE_REASONS,
	deliveryFailureBody,
	deliveryFailureSchema,
	handoverScreenOpen,
	initialShopOrderTab,
	lockedHandoverNotice,
	mapsUrl,
	rowAcceptBy,
	SELLER_END_REASON_KEYS,
	SELLER_END_REASONS,
	sellerEndBody,
	sellerEndSchema,
	TIER_LABEL_KEYS,
	tierTone,
} from "./sellerOrders";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const FUTURE = "2026-10-05T12:00:00.000Z";

function orderAt(
	status: OrderStatusName,
	patch: Partial<OrderActionSubject> = {},
): OrderActionSubject {
	return {
		status,
		confirmation: {
			method: null,
			required: "seller_call",
			attemptsLeft: 5,
			resendsLeft: 3,
		},
		handover: {
			method: null,
			locked: false,
			attemptsLeft: 5,
			regenerationsLeft: 3,
		},
		completionHold: "none",
		returnCaseNumber: null,
		deadlines: {
			confirmBy: FUTURE,
			acceptBy: FUTURE,
			staleAt: null,
			completeAt: null,
			withdrawalUntil: null,
			contestBy: null,
		},
		deliveryFailure: null,
		reviewable: false,
		...patch,
	};
}

function delivery(patch: Partial<OrderDeliveryView> = {}): OrderDeliveryView {
	return {
		method: "seller_delivery",
		recipientName: "Awa",
		phone: "+237 690 12 34 56",
		phoneMasked: false,
		city: "douala",
		district: "douala.akwa",
		districtOther: null,
		landmark: "Face pharmacie du port",
		gps: null,
		instructions: null,
		etaText: "24h",
		fee: 1000,
		pickupPoint: null,
		...patch,
	};
}

type Json = { [key: string]: Json | string };

function resolves(catalogue: Json, path: string): boolean {
	const value = path
		.split(".")
		.reduce<Json | string | undefined>(
			(acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined),
			catalogue,
		);
	return typeof value === "string";
}

describe("the action bar is the shared table's answer", () => {
	test("an owner on a confirmed order gets accept, decline and cancel", () => {
		const actions = actionBarItems(orderAt("confirmed"), "owner", NOW).map(
			(item) => item.action,
		);
		expect(actions).toEqual(["accept", "decline", "seller_cancel"]);
	});

	test("a staff member on the same order sees no cancel", () => {
		const actions = actionBarItems(orderAt("confirmed"), "staff", NOW).map(
			(item) => item.action,
		);
		expect(actions).toEqual(["accept", "decline"]);
	});

	test("a shipped order offers the four delivery outcomes", () => {
		const actions = actionBarItems(orderAt("shipped"), "staff", NOW).map(
			(item) => item.action,
		);
		expect(actions).toEqual([
			"handover",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
		]);
	});

	test("a locked handover drops the code entry and keeps the declaration", () => {
		const locked = orderAt("shipped", {
			handover: {
				method: null,
				locked: true,
				attemptsLeft: 0,
				regenerationsLeft: 3,
			},
		});
		const items = actionBarItems(locked, "staff", NOW);
		expect(items.map((item) => item.action)).toEqual([
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
		]);
		expect(handoverScreenOpen(items)).toBe(true);
		expect(lockedHandoverNotice(locked, items)).toBe(true);
	});

	test("an open handover shows no lock notice", () => {
		const open = orderAt("shipped");
		const items = actionBarItems(open, "owner", NOW);
		expect(handoverScreenOpen(items)).toBe(true);
		expect(lockedHandoverNotice(open, items)).toBe(false);
	});

	test("the handover screen closes once the order leaves shipped", () => {
		const delivered = orderAt("delivered", {
			handover: {
				method: "otp",
				locked: false,
				attemptsLeft: 4,
				regenerationsLeft: 3,
			},
		});
		const items = actionBarItems(delivered, "owner", NOW);
		expect(handoverScreenOpen(items)).toBe(false);
		expect(lockedHandoverNotice(delivered, items)).toBe(false);
	});

	test("a delivered order offers the seller nothing to press", () => {
		expect(actionBarItems(orderAt("delivered"), "owner", NOW)).toHaveLength(0);
	});

	test("the call path posts at once and the handover opens its screen", () => {
		const items = actionBarItems(orderAt("placed"), "owner", NOW);
		expect(items.map((item) => [item.action, item.kind])).toEqual([
			["confirm_by_call", "post"],
			["decline", "sheet"],
			["seller_cancel", "sheet"],
		]);
		const shipped = actionBarItems(orderAt("shipped"), "owner", NOW);
		expect(shipped[0]).toMatchObject({ action: "handover", kind: "screen" });
	});

	test("every label key exists in both locales", () => {
		const statuses: OrderStatusName[] = [
			"placed",
			"confirmed",
			"accepted",
			"shipped",
		];
		const keys = statuses.flatMap((status) =>
			actionBarItems(orderAt(status), "owner", NOW).map((i) => i.labelKey),
		);
		expect(new Set(keys).size).toBe(9);
		for (const key of keys) {
			expect(resolves(en as Json, key)).toBe(true);
			expect(resolves(fr as Json, key)).toBe(true);
		}
	});
});

describe("the reason sheets speak the API's vocabulary", () => {
	test("the seller's end reasons are the spec's four", () => {
		expect([...SELLER_END_REASONS]).toEqual([
			"seller_out_of_stock",
			"seller_cannot_deliver",
			"seller_buyer_unreachable",
			"seller_other",
		]);
	});

	test("the delivery-failure reasons are the six the collection stores", () => {
		expect([...DELIVERY_FAILURE_REASONS]).toEqual([
			"refused",
			"unreachable",
			"absent",
			"address_not_found",
			"timeout",
			"other",
		]);
	});

	test("every reason label exists in both locales", () => {
		const keys = [
			...Object.values(SELLER_END_REASON_KEYS),
			...Object.values(DELIVERY_FAILURE_REASON_KEYS),
		];
		expect(keys).toHaveLength(10);
		for (const key of keys) {
			expect(resolves(en as Json, key)).toBe(true);
			expect(resolves(fr as Json, key)).toBe(true);
		}
	});

	test("seller_other is refused without a note", () => {
		const result = sellerEndSchema.safeParse({
			reason: "seller_other",
			note: "  ",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.map((issue) => issue.path[0])).toEqual([
				"note",
			]);
		}
	});

	test("another reason needs no note", () => {
		const result = sellerEndSchema.safeParse({
			reason: "seller_out_of_stock",
			note: "",
		});
		expect(result.success).toBe(true);
	});

	test("no reason chosen is refused on the reason field", () => {
		const result = sellerEndSchema.safeParse({ reason: null, note: "" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["reason"]);
		}
	});

	test("the body sends a trimmed note and drops an empty one", () => {
		expect(sellerEndBody({ reason: "seller_other", note: " gone " })).toEqual({
			reason: "seller_other",
			note: "gone",
		});
		expect(
			sellerEndBody({ reason: "seller_cannot_deliver", note: "   " }),
		).toEqual({ reason: "seller_cannot_deliver" });
		expect(sellerEndBody({ reason: null, note: "x" })).toBeNull();
	});

	test("a delivery failure needs a reason and only that", () => {
		expect(
			deliveryFailureSchema.safeParse({ reason: null, note: "" }).success,
		).toBe(false);
		expect(
			deliveryFailureSchema.safeParse({ reason: "absent", note: "" }).success,
		).toBe(true);
		expect(deliveryFailureBody({ reason: "absent", note: "" })).toEqual({
			reason: "absent",
		});
	});
});

describe("the list's row decorations", () => {
	test("the countdown reads hours and minutes left, rounded down", () => {
		expect(acceptCountdown("2026-10-02T15:42:59.000Z", NOW)).toEqual({
			expired: false,
			hours: 3,
			minutes: 42,
			urgent: true,
		});
		expect(acceptCountdown("2026-10-03T20:00:00.000Z", NOW)).toEqual({
			expired: false,
			hours: 32,
			minutes: 0,
			urgent: false,
		});
	});

	test("a passed deadline reads as expired and a missing one as nothing", () => {
		expect(acceptCountdown("2026-10-02T11:59:00.000Z", NOW)).toEqual({
			expired: true,
		});
		expect(acceptCountdown(null, NOW)).toBeNull();
		expect(acceptCountdown(undefined, NOW)).toBeNull();
	});

	test("only an order still waiting on the shop shows its countdown", () => {
		expect(rowAcceptBy({ status: "confirmed", acceptBy: FUTURE })).toBe(FUTURE);
		expect(rowAcceptBy({ status: "accepted", acceptBy: FUTURE })).toBeNull();
		expect(rowAcceptBy({ status: "placed", acceptBy: null })).toBeNull();
	});

	test("every tier has a label in both locales and a tone", () => {
		const keys = Object.values(TIER_LABEL_KEYS);
		expect(keys).toHaveLength(5);
		for (const key of keys) {
			expect(resolves(en as Json, key)).toBe(true);
			expect(resolves(fr as Json, key)).toBe(true);
		}
		expect(tierTone("trusted")).toBe("good");
		expect(tierTone("watch")).toBe("warning");
		expect(tierTone("new")).toBe("neutral");
	});

	test("the list opens on the tab a link names, else on to_accept", () => {
		expect(initialShopOrderTab("to_ship")).toBe("to_ship");
		expect(initialShopOrderTab(["shipped"])).toBe("shipped");
		expect(initialShopOrderTab("nonsense")).toBe("to_accept");
		expect(initialShopOrderTab(undefined)).toBe("to_accept");
	});
});

describe("calling and finding the buyer", () => {
	test("the call button dials the number without its spaces", () => {
		expect(callHref(delivery())).toBe("tel:+237690123456");
	});

	test("a masked number offers no call", () => {
		expect(
			callHref(delivery({ phone: "+237 6•• •• •• 56", phoneMasked: true })),
		).toBeNull();
	});

	test("a GPS pin wins over the landmark", () => {
		expect(
			mapsUrl(delivery({ gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12 } })),
		).toBe("https://www.google.com/maps/search/?api=1&query=4.05,9.7");
	});

	test("without a pin the landmark, district and city are searched", () => {
		expect(mapsUrl(delivery())).toBe(
			`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
				"Face pharmacie du port, Akwa, douala, Cameroun",
			)}`,
		);
	});

	test("with neither there is no Maps link", () => {
		expect(mapsUrl(delivery({ landmark: null }))).toBeNull();
	});
});
