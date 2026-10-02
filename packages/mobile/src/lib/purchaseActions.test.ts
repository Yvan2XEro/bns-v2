import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import type { OrderStatusName, OrderView } from "../types/order";
import { availableActions } from "./orderActions";
import { ORDER_STATUSES } from "./orderStatus";
import {
	barActions,
	HANDOVER_FALLBACK_KEYS,
	handoverCardState,
	PURCHASE_TAB_LABEL_KEYS,
	PURCHASE_TABS,
	purchaseStatusKey,
	purchaseTab,
	receiptFileName,
	TIMELINE_FALLBACK_KEY,
	TIMELINE_LABEL_KEYS,
	timelineLabelKey,
	windowCountdown,
	withdrawalWindow,
} from "./purchaseActions";

type Json = { [key: string]: Json | string };

function lookup(locale: Json, key: string): Json | string | undefined {
	return key
		.split(".")
		.reduce<Json | string | undefined>(
			(node, part) =>
				node && typeof node === "object" ? node[part] : undefined,
			locale,
		);
}

function inBothLocales(key: string): boolean {
	return (
		typeof lookup(en as Json, key) === "string" &&
		typeof lookup(fr as Json, key) === "string"
	);
}

const NOW = new Date("2026-10-02T10:00:00Z");

function order(
	status: OrderStatusName,
	patch: Partial<OrderView> = {},
): OrderView {
	return {
		id: "o-1",
		orderNumber: "BNS-2026-000123",
		status,
		paymentStatus: "cod_pending",
		paymentMethod: "cod",
		amounts: {
			subtotal: 20000,
			deliveryFee: 1500,
			discount: 0,
			buyerProtectionFee: 0,
			total: 21500,
			currency: "XAF",
		},
		items: [],
		timeline: [],
		shop: {
			id: "s-1",
			name: "Boutique Akwa",
			handle: "akwa",
			logoUrl: null,
			city: "douala",
			phone: null,
		},
		delivery: {
			method: "seller_delivery",
			recipientName: "Awa",
			phone: "+237690000000",
			phoneMasked: false,
			city: "douala",
			district: "douala.akwa",
			districtOther: null,
			landmark: "Face pharmacie",
			gps: null,
			instructions: null,
			etaText: "24 h",
			fee: 1500,
			pickupPoint: null,
		},
		deadlines: {
			confirmBy: null,
			acceptBy: null,
			staleAt: null,
			completeAt: null,
			withdrawalUntil: null,
			contestBy: null,
		},
		timestamps: {
			placedAt: "2026-09-30T10:00:00Z",
			confirmedAt: null,
			acceptedAt: null,
			shippedAt: null,
			deliveredAt: null,
			completedAt: null,
			cancelledAt: null,
			failedAt: null,
		},
		confirmation: {
			method: "verified_phone",
			required: "none",
			attemptsLeft: 5,
			resendsLeft: 3,
		},
		handover: {
			method: null,
			locked: false,
			attemptsLeft: 5,
			regenerationsLeft: 3,
		},
		cancellation: null,
		deliveryFailure: null,
		completionHold: "none",
		returnCaseNumber: null,
		conversationId: null,
		reviewable: false,
		...patch,
	};
}

function shipped(handover: Partial<OrderView["handover"]>): OrderView {
	const base = order("shipped");
	return order("shipped", { handover: { ...base.handover, ...handover } });
}

const buyerActions = (o: OrderView) =>
	availableActions(o, "buyer", null, { now: NOW });

describe("purchaseTab", () => {
	test("files every status under exactly one of the three tabs", () => {
		const counts = { open: 0, delivered: 0, cancelled: 0 };
		for (const status of ORDER_STATUSES) counts[purchaseTab(status)] += 1;
		expect(counts).toEqual({ open: 6, delivered: 3, cancelled: 2 });
		expect(PURCHASE_TABS).toEqual(["open", "delivered", "cancelled"]);
	});

	test("keeps an order on its way open and a failed one with the ended ones", () => {
		expect(purchaseTab("shipped")).toBe("open");
		expect(purchaseTab("completed")).toBe("delivered");
		expect(purchaseTab("delivery_failed")).toBe("cancelled");
	});

	test("labels every tab with a key present in both locales", () => {
		const keys = Object.values(PURCHASE_TAB_LABEL_KEYS);
		expect(keys).toHaveLength(3);
		expect(keys.filter(inBothLocales)).toEqual(keys);
	});
});

describe("purchaseStatusKey", () => {
	test("names every status the buyer's way, in both locales", () => {
		const keys = ORDER_STATUSES.map(purchaseStatusKey);
		expect(keys).toHaveLength(11);
		expect(keys[0]).toBe("orderStatus.status_placed_buyer");
		expect(keys.filter(inBothLocales)).toEqual(keys);
	});
});

describe("barActions", () => {
	test("a delivered order's bar is the contest, the return and the receipt, in the table's order", () => {
		const bar = barActions(
			buyerActions(
				order("delivered", {
					reviewable: true,
					handover: {
						...order("delivered").handover,
						method: "seller_declaration",
					},
					deadlines: {
						...order("delivered").deadlines,
						withdrawalUntil: "2026-10-10T10:00:00Z",
						contestBy: "2026-10-04T10:00:00Z",
					},
				}),
			),
		);
		expect(bar.map((entry) => [entry.action, entry.kind])).toEqual([
			["contest_delivery", "sheet"],
			["request_withdrawal", "screen"],
			["receipt", "receipt"],
		]);
	});

	test("leaves the panel actions to their panels", () => {
		const actions = buyerActions(
			order("placed", {
				confirmation: {
					method: "sms_code",
					required: "sms_code",
					attemptsLeft: 5,
					resendsLeft: 3,
				},
				deadlines: {
					...order("placed").deadlines,
					confirmBy: "2026-10-03T10:00:00Z",
				},
			}),
		);
		expect(actions).toEqual([
			"confirm_code",
			"resend_code",
			"cancel",
			"receipt",
		]);
		expect(barActions(actions).map((entry) => entry.action)).toEqual([
			"cancel",
			"receipt",
		]);
	});

	test("a shipped order's bar offers confirm receipt first", () => {
		const bar = barActions(buyerActions(shipped({})));
		expect(bar.map((entry) => entry.action)).toEqual([
			"confirm_receipt",
			"receipt",
		]);
		expect(bar[0]?.tone).toBe("primary");
	});

	test("every bar label exists in both locales", () => {
		const labels = barActions([
			"confirm_receipt",
			"request_withdrawal",
			"contest_delivery",
			"cancel",
			"receipt",
		]).map((entry) => entry.labelKey);
		expect(labels).toHaveLength(5);
		expect(labels.filter(inBothLocales)).toEqual(labels);
	});
});

describe("timelineLabelKey", () => {
	test("names every event type the API writes, plus the reserved three", () => {
		expect(Object.keys(TIMELINE_LABEL_KEYS)).toHaveLength(24);
		expect(timelineLabelKey("order.handover_code_regenerated")).toBe(
			"purchases.event_handover_code_regenerated",
		);
	});

	test("falls back to a generic label for a type it does not know", () => {
		expect(timelineLabelKey("order.something_new")).toBe(TIMELINE_FALLBACK_KEY);
	});

	test("has every label in both locales", () => {
		const keys = [...Object.values(TIMELINE_LABEL_KEYS), TIMELINE_FALLBACK_KEY];
		expect(keys).toHaveLength(25);
		expect(keys.filter((key) => !inBothLocales(key))).toEqual([]);
	});
});

describe("windowCountdown", () => {
	test("counts whole days and hours to the deadline", () => {
		expect(windowCountdown("2026-10-05T13:30:00Z", NOW)).toEqual({
			days: 3,
			hours: 3,
		});
	});

	test("is null once the deadline has passed, or when there is none", () => {
		expect(windowCountdown("2026-10-02T09:59:59Z", NOW)).toBeNull();
		expect(windowCountdown(null, NOW)).toBeNull();
	});
});

describe("withdrawalWindow", () => {
	const until = "2026-10-12T12:00:00Z";
	const delivered = (patch: Partial<OrderView> = {}) =>
		order("delivered", {
			deadlines: { ...order("delivered").deadlines, withdrawalUntil: until },
			...patch,
		});

	test("counts down from deadlines.withdrawalUntil", () => {
		expect(withdrawalWindow(delivered(), NOW)).toEqual({
			kind: "open",
			until,
			days: 10,
			hours: 2,
		});
	});

	test("names the open case instead of a countdown once one exists", () => {
		expect(
			withdrawalWindow(delivered({ returnCaseNumber: "RET-0042" }), NOW),
		).toEqual({ kind: "caseOpen", caseNumber: "RET-0042" });
	});

	test("says the window closed, and says nothing before delivery", () => {
		expect(
			withdrawalWindow(delivered(), new Date("2026-10-12T12:00:01Z")),
		).toEqual({ kind: "closed" });
		expect(withdrawalWindow(order("shipped"), NOW)).toEqual({ kind: "none" });
	});

	test("the countdown and the return button leave on the same tick", () => {
		const after = new Date("2026-10-12T12:00:01Z");
		expect(buyerActions(delivered())).toContain("request_withdrawal");
		expect(
			availableActions(delivered(), "buyer", null, { now: after }),
		).not.toContain("request_withdrawal");
		expect(withdrawalWindow(delivered(), after).kind).toBe("closed");
	});
});

describe("handoverCardState", () => {
	test("shows both fallbacks when the handover is locked", () => {
		const locked = shipped({ locked: true, regenerationsLeft: 2 });
		const state = handoverCardState(locked, buyerActions(locked), undefined);
		expect(state.fallbackKeys).toEqual([
			"purchases.handoverFallbackConfirm",
			"purchases.handoverFallbackSeller",
		]);
		expect(state.locked).toBe(true);
		expect(HANDOVER_FALLBACK_KEYS.filter(inBothLocales)).toHaveLength(2);
	});

	test("shows no fallbacks while the code still works", () => {
		const open = shipped({});
		expect(handoverCardState(open, buyerActions(open), undefined)).toEqual({
			locked: false,
			regenerationsLeft: 3,
			canRegenerate: true,
			showCode: false,
			fallbackKeys: [],
		});
	});

	test("shows the regenerated code in large digits, and hides it once locked", () => {
		const open = shipped({});
		expect(handoverCardState(open, buyerActions(open), "4821").showCode).toBe(
			true,
		);
		const locked = shipped({ locked: true });
		expect(
			handoverCardState(locked, buyerActions(locked), "4821").showCode,
		).toBe(false);
	});

	test("the regenerate button is the action list's, not the card's", () => {
		const open = shipped({});
		expect(handoverCardState(open, [], undefined).canRegenerate).toBe(false);
		expect(
			handoverCardState(open, ["regenerate_handover_code"], undefined)
				.canRegenerate,
		).toBe(true);
	});
});

describe("receiptFileName", () => {
	test("names the file after the order, in the reader's language", () => {
		expect(receiptFileName("BNS-2026/0001", "fr")).toBe(
			"recu-BNS-2026_0001.html",
		);
		expect(receiptFileName("BNS-2026-0001", "en")).toBe(
			"receipt-BNS-2026-0001.html",
		);
	});
});

describe("the purchases namespace", () => {
	/**
	 * i18next interpolates `{{name}}`; a single-brace placeholder is printed
	 * literally. Task 7 shipped five of them in this namespace, copied from
	 * web's ICU messages.
	 */
	test("every placeholder uses i18next's double braces", () => {
		const singles = (locale: Json) =>
			Object.entries(locale.purchases as Json).filter(
				([, value]) =>
					typeof value === "string" && /(^|[^{]){[a-zA-Z]+}/.test(value),
			);
		expect(singles(en as Json)).toEqual([]);
		expect(singles(fr as Json)).toEqual([]);
		expect(
			Object.keys(en.purchases).filter((key) =>
				String((en.purchases as Json)[key]).includes("{{"),
			).length,
		).toBeGreaterThanOrEqual(5);
	});
});
