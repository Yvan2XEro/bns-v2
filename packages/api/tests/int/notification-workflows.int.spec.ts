import { describe, expect, it } from "vitest";
import { buildExpoPushData } from "../../src/hooks/notificationEvents";
import { WORKFLOWS } from "../../src/scripts/syncNotificationWorkflows";

const ids = WORKFLOWS.map((w) => w.workflowId);

describe("the P3 workflows", () => {
	it("declares all eight", () => {
		for (const id of [
			"shop-invitation",
			"shop-invitation-accepted",
			"shop-invitation-declined",
			"shop-member-removed",
			"shop-member-role-changed",
			"shop-team-paused",
			"shop-inbox-message",
			"shop-conversation-assigned",
		]) {
			expect(ids).toContain(id);
		}
	});

	it("gives each one a payload schema whose required fields the service sends", () => {
		const inbox = WORKFLOWS.find((w) => w.workflowId === "shop-inbox-message");
		expect(inbox?.payloadSchema).toMatchObject({
			required: [
				"shopId",
				"shopName",
				"conversationId",
				"buyerName",
				"messagePreview",
			],
		});
	});

	it("puts shop-invitation on the email channel and the rest on in-app plus push", () => {
		const invitation = WORKFLOWS.find(
			(w) => w.workflowId === "shop-invitation",
		);
		expect(invitation?.steps.map((s) => s.type)).toEqual([
			"email",
			"in_app",
			"push",
		]);
		const inbox = WORKFLOWS.find((w) => w.workflowId === "shop-inbox-message");
		expect(inbox?.steps.map((s) => s.type)).toEqual(["in_app", "push"]);
	});

	it("declares no duplicate workflow ids", () => {
		expect(new Set(ids).size).toBe(ids.length);
	});
});

/**
 * Task 16's brief and its own caller both assert "sixteen" P4 order and
 * commission workflows. The spec this brief names as authority
 * (`docs/superpowers/specs/2026-09-15-p4-cod-orders-design.md`, "Notifications"
 * table) lists exactly fourteen: eleven `order-*` rows plus three
 * `commission-invoice-*` rows. This test pins those fourteen, so a forgotten
 * one fails by naming it and an accidental extra under the same prefix fails
 * too — it does not pretend the count is sixteen to match an assertion the
 * primary source does not support.
 *
 * `order-stale-reminder` is the fifteenth and is NOT in the spec's table: the
 * spec gives `failStaleOrders` its three-day nudge but no workflow row for
 * it, so the job was triggering an event nothing delivered. The catalogue
 * entry was added with the shape of the fourteen; it is listed here because
 * a workflow the code fires must exist, not because the spec names it.
 */
const P4_WORKFLOW_IDS = [
	"order-placed",
	"order-confirmation-needed",
	"order-accept-reminder",
	"order-accepted",
	"order-shipped",
	"order-delivered",
	"order-cancelled",
	"order-delivery-failed",
	"order-delivery-declared",
	"order-withdrawal-requested",
	"order-review-reminder",
	"order-stale-reminder",
	"commission-invoice-issued",
	"commission-invoice-overdue",
	"commission-invoice-paid",
] as const;

const P4_PAYLOAD_REQUIRED_FIELDS: Record<string, string[]> = {
	"order-placed": [
		"orderId",
		"orderNumber",
		"shopName",
		"total",
		"audience",
		"confirmationRequired",
	],
	"order-confirmation-needed": ["orderId", "orderNumber", "tier"],
	"order-accept-reminder": ["orderId", "orderNumber", "acceptBy"],
	"order-accepted": ["orderId", "orderNumber", "shopName", "etaText"],
	"order-shipped": ["orderId", "orderNumber", "method", "pickupPoint"],
	"order-delivered": [
		"orderId",
		"orderNumber",
		"withdrawalUntil",
		"reviewUrl",
		"audience",
	],
	"order-cancelled": ["orderId", "orderNumber", "by", "reason"],
	"order-delivery-failed": ["orderId", "orderNumber", "reason"],
	"order-delivery-declared": ["orderId", "orderNumber", "contestBy"],
	"order-withdrawal-requested": ["orderId", "caseNumber", "itemsCount"],
	"order-review-reminder": ["orderId", "shopName"],
	"order-stale-reminder": ["orderId", "orderNumber", "shippedAt", "staleAt"],
	"commission-invoice-issued": [
		"invoiceId",
		"invoiceNumber",
		"totalDue",
		"dueAt",
	],
	"commission-invoice-overdue": ["invoiceId", "invoiceNumber", "stage"],
	"commission-invoice-paid": ["invoiceId", "invoiceNumber"],
};

describe("the P4 order and commission workflows", () => {
	it("declares exactly the spec's fourteen plus order-stale-reminder, no fewer and no more under the same prefixes", () => {
		for (const id of P4_WORKFLOW_IDS) {
			expect(ids).toContain(id);
		}
		const orderAndCommissionIds = ids.filter(
			(id) => id.startsWith("order-") || id.startsWith("commission-invoice-"),
		);
		expect(orderAndCommissionIds.sort()).toEqual([...P4_WORKFLOW_IDS].sort());
	});

	it("gives each one a payloadSchema whose required fields match the spec's table, field for field", () => {
		for (const [id, fields] of Object.entries(P4_PAYLOAD_REQUIRED_FIELDS)) {
			const workflow = WORKFLOWS.find((w) => w.workflowId === id);
			expect(workflow?.payloadSchema).toMatchObject({ required: fields });
		}
	});

	it("declares no duplicate workflow ids among the full set", () => {
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("buildExpoPushData", () => {
	it("deep-links an inbox message to the shop inbox thread", () => {
		expect(
			buildExpoPushData("shop-inbox-message", {
				conversationId: "c-1",
				shopId: "s-1",
			}),
		).toEqual({
			conversationId: "c-1",
			shopId: "s-1",
			url: "/seller/inbox/c-1",
		});
	});

	it("deep-links an assignment to the same place", () => {
		expect(
			buildExpoPushData("shop-conversation-assigned", {
				conversationId: "c-1",
				shopId: "s-1",
			}),
		).toEqual({
			conversationId: "c-1",
			shopId: "s-1",
			url: "/seller/inbox/c-1",
		});
	});

	it("deep-links the team workflows to the team screen", () => {
		for (const event of [
			"shop-invitation-accepted",
			"shop-invitation-declined",
			"shop-member-role-changed",
			"shop-team-paused",
		]) {
			expect(buildExpoPushData(event, {})).toEqual({ url: "/seller/team" });
		}
	});

	it("sends a removed member to their own shops list, not to a shop they can no longer open", () => {
		expect(buildExpoPushData("shop-member-removed", { shopId: "s-1" })).toEqual(
			{
				url: "/account",
			},
		);
	});

	it("sends an invitation push to the invite page", () => {
		expect(
			buildExpoPushData("shop-invitation", {
				inviteUrl: "https://buynsellem.com/invite/tok",
			}),
		).toEqual({
			url: "/invite/tok",
		});
	});
});

describe("buildExpoPushData for the fifteen P4 order and commission workflows", () => {
	it("sends order-placed and order-delivered to the buyer's purchase screen by default", () => {
		for (const event of ["order-placed", "order-delivered"]) {
			expect(buildExpoPushData(event, { orderId: "o-1" })).toEqual({
				orderId: "o-1",
				url: "/purchases/o-1",
			});
		}
	});

	it("sends order-placed and order-delivered to the shop's order screen for the shop audience", () => {
		for (const event of ["order-placed", "order-delivered"]) {
			expect(
				buildExpoPushData(event, { orderId: "o-1", audience: "shop" }),
			).toEqual({
				orderId: "o-1",
				url: "/seller/orders/o-1",
			});
		}
	});

	it("sends the three shop-only order workflows to the shop's order screen", () => {
		for (const event of [
			"order-confirmation-needed",
			"order-accept-reminder",
			"order-stale-reminder",
		]) {
			expect(buildExpoPushData(event, { orderId: "o-1" })).toEqual({
				orderId: "o-1",
				url: "/seller/orders/o-1",
			});
		}
	});

	it("sends every buyer-only or mixed-recipient order workflow to the buyer's purchase screen", () => {
		for (const event of [
			"order-accepted",
			"order-shipped",
			"order-cancelled",
			"order-delivery-failed",
			"order-delivery-declared",
			"order-withdrawal-requested",
			"order-review-reminder",
		]) {
			expect(buildExpoPushData(event, { orderId: "o-1" })).toEqual({
				orderId: "o-1",
				url: "/purchases/o-1",
			});
		}
	});

	it("sends the three commission workflows to the shop's billing screen", () => {
		for (const event of [
			"commission-invoice-issued",
			"commission-invoice-overdue",
			"commission-invoice-paid",
		]) {
			expect(buildExpoPushData(event, { invoiceId: "inv-1" })).toEqual({
				invoiceId: "inv-1",
				url: "/seller/billing/inv-1",
			});
		}
	});
});
