import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import type { OrderActionSubject } from "./orderActions";
import {
	ORDER_STATUS_LABEL_KEYS,
	ORDER_STATUSES,
	type OrderStatusName,
} from "./orderStatus";
import {
	ACTOR_KEYS,
	BUYER_TIER_KEYS,
	CANCELLATION_REASON_KEYS,
	reasonKey,
	STAFF_CANCEL_REASON_KEYS,
	STAFF_STATUS_KEYS,
	staffCancelDraft,
	staffSheetActions,
	TIMELINE_EVENT_KEYS,
	timelineEventKey,
} from "./staffOrderSheet";

type Json = { [key: string]: Json | string };

function lookup(root: Json, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(node, key) =>
				node && typeof node === "object" ? (node as Json)[key] : undefined,
			root,
		);
}

const NOW = new Date("2026-10-02T12:00:00.000Z");

function orderAt(status: OrderStatusName): OrderActionSubject {
	return {
		status,
		paymentMethod: "cod",
		completionHold: "none",
		deadlines: {
			confirmBy: null,
			acceptBy: null,
			staleAt: null,
			completeAt: null,
			withdrawalUntil: null,
			contestBy: null,
		},
		deliveryFailure: null,
		reviewable: false,
	};
}

describe("staffSheetActions", () => {
	test("offers the cancel at exactly the four moderator-cancellable statuses", () => {
		const statuses: OrderStatusName[] = [
			"placed",
			"confirmed",
			"paid",
			"accepted",
			"shipped",
			"delivered",
			"completed",
			"cancelled",
			"delivery_failed",
			"returned",
			"disputed",
		];
		const cancellable = statuses.filter(
			(status) => staffSheetActions(orderAt(status), NOW).canCancel,
		);
		expect(cancellable).toEqual(["placed", "confirmed", "accepted", "shipped"]);
	});

	test("offers the receipt in every status", () => {
		expect(staffSheetActions(orderAt("cancelled"), NOW)).toEqual({
			canCancel: false,
			canReceipt: true,
		});
		expect(staffSheetActions(orderAt("shipped"), NOW)).toEqual({
			canCancel: true,
			canReceipt: true,
		});
	});
});

describe("staffCancelDraft", () => {
	test("a staff reason with no note becomes the route's body, note null", () => {
		expect(staffCancelDraft("staff_fraud", "   ")).toEqual({
			ok: true,
			input: { reason: "staff_fraud", note: null },
		});
	});

	test("the note is sent trimmed", () => {
		expect(staffCancelDraft("staff_policy", "  doublon ")).toEqual({
			ok: true,
			input: { reason: "staff_policy", note: "doublon" },
		});
	});

	test("staff_other without a note is refused before the request", () => {
		expect(staffCancelDraft("staff_other", "  ")).toEqual({
			ok: false,
			errorKey: "moderationOrder.noteRequired",
		});
	});

	test("staff_other with a note is accepted", () => {
		expect(staffCancelDraft("staff_other", "fake shop")).toEqual({
			ok: true,
			input: { reason: "staff_other", note: "fake shop" },
		});
	});

	test("a reason the server does not know, or none, is refused", () => {
		expect(staffCancelDraft("seller_other", "x")).toEqual({
			ok: false,
			errorKey: "moderation.decisionChoiceRequired",
		});
		expect(staffCancelDraft(null, "")).toEqual({
			ok: false,
			errorKey: "moderation.decisionChoiceRequired",
		});
	});
});

describe("the computed label keys", () => {
	test("every key a map can pick exists in both locales", () => {
		const keys = [
			...Object.values(STAFF_CANCEL_REASON_KEYS),
			...Object.values(BUYER_TIER_KEYS),
			...Object.values(ACTOR_KEYS),
			...Object.values(TIMELINE_EVENT_KEYS),
			...Object.values(CANCELLATION_REASON_KEYS),
			...["refused", "absent", "nonsense"].map(reasonKey),
			"moderationOrder.event_other",
			"moderationOrder.noteRequired",
		];
		const missing = keys.filter(
			(key) =>
				typeof lookup(en as Json, key) !== "string" ||
				typeof lookup(fr as Json, key) !== "string",
		);
		expect(missing).toEqual([]);
		expect(keys.length).toBe(3 + 5 + 5 + 21 + 12 + 3 + 2);
	});

	test("an event type the table does not know falls back to the generic label", () => {
		expect(timelineEventKey("order.cancelled")).toBe(
			"moderationOrder.event_cancelled",
		);
		expect(timelineEventKey("order.something_new")).toBe(
			"moderationOrder.event_other",
		);
	});
});

describe("reasonKey", () => {
	test("labels a cancellation reason, a delivery failure, and nothing raw", () => {
		expect(reasonKey("staff_fraud")).toBe("moderationOrder.reason_staff_fraud");
		expect(reasonKey("seller_timeout")).toBe(
			"moderationOrder.reason_seller_timeout",
		);
		expect(reasonKey("refused")).toBe("orderStatus.failure_refused");
		expect(reasonKey("brand_new_reason")).toBe(
			"moderationOrder.reason_unknown",
		);
	});
});

describe("STAFF_STATUS_KEYS", () => {
	test("spells out the seller-side label of every status", () => {
		for (const status of ORDER_STATUSES) {
			expect(STAFF_STATUS_KEYS[status]).toBe(
				`orderStatus.${ORDER_STATUS_LABEL_KEYS[status].seller}`,
			);
		}
		expect(Object.keys(STAFF_STATUS_KEYS)).toHaveLength(ORDER_STATUSES.length);
	});
});
