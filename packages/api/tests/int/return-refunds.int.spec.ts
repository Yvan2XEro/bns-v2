// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerResaleAdjuster } from "../../src/lib/resale";
import { withTransaction } from "../../src/lib/transactions";
import { notifyRefundOverdue } from "../../src/services/caseNotifications";
import { issueInvoicesForWeek } from "../../src/services/commission";
import { adjustResellerCommission } from "../../src/services/purchaseOrders";
import {
	advanceReturnRefunds,
	confirmRefund,
	contestRefund,
	executeRefund,
	submitRefundProof,
} from "../../src/services/returnRefunds";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/services/caseNotifications", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../src/services/caseNotifications")
		>();
	return { ...actual, notifyRefundOverdue: vi.fn() };
});

const NOW = new Date("2026-10-04T12:00:00.000Z");

function world(paidAt = NOW) {
	return fakePayload({
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-1",
				buyer: "buyer-1",
				shop: "shop-1",
				status: "delivered",
				paymentMethod: "mobile_money",
				paymentStatus: "paid",
				amounts: {
					subtotal: 10_000,
					deliveryFee: 0,
					total: 10_000,
					destinationAmount: 8_000,
					commission: 1_000,
					commissionVat: 500,
					buyerProtectionFee: 500,
				},
				settlement: { refundedAmount: 0 },
			},
		],
		"payment-intents": [
			{
				id: "intent-1",
				purpose: "checkout",
				targetType: "order",
				targetId: "order-1",
				amount: 10_000,
				status: "succeeded",
				reference: "PAY-1",
				statusHistory: [
					{ status: "succeeded", source: "webhook", at: paidAt.toISOString() },
				],
			},
		],
		"return-cases": [
			{
				id: "return-1",
				number: "RET-1",
				basis: "withdrawal",
				order: "order-1",
				shop: "shop-1",
				buyer: "buyer-1",
				openedByType: "buyer",
				status: "refund_pending",
				refund: { amount: 1_000, breakdown: { goods: 1_000 }, channel: null },
			},
		],
		"purchase-orders": [],
		"reseller-commissions": [],
		refunds: [],
		"ledger-transactions": [],
		"ledger-accounts": [],
		"payout-holds": [],
	});
}

afterEach(() => vi.useRealTimers());

describe("executeRefund", () => {
	it("reduces the reseller commission for a resale return exactly once", async () => {
		const payload = world();
		payload.store["purchase-orders"]?.push({
			id: "po-1",
			order: "order-1",
			resellerShop: "shop-1",
			supplierShop: "supplier-1",
			resellerCommission: 1000,
			items: [{ orderItem: "item-1", resellerUnitPrice: 10_000, quantity: 1 }],
		});
		payload.store["reseller-commissions"]?.push({
			id: "commission-1",
			purchaseOrder: "po-1",
			resellerShop: "shop-1",
			supplierShop: "supplier-1",
			order: "order-1",
			amount: 1000,
			status: "accrued",
			holdReasons: [],
		});
		const unregister = registerResaleAdjuster({ adjustResellerCommission });
		try {
			const kase = await payload.findByID({
				collection: "return-cases",
				id: "return-1",
				depth: 0,
			});
			await withTransaction(payload, (req) => executeRefund(req, kase));
			const fresh = await payload.findByID({
				collection: "return-cases",
				id: "return-1",
				depth: 0,
			});
			await withTransaction(payload, (req) => executeRefund(req, fresh));
		} finally {
			unregister();
		}

		expect(payload.store["reseller-commissions"]?.[0]).toMatchObject({
			amount: 900,
			adjustments: [{ source: "return", sourceId: "return-1", delta: -100 }],
		});
	});

	it("creates one P5 refund row for a protected return and reuses it on retry", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		const payload = world();
		const kase = await payload.findByID({
			collection: "return-cases",
			id: "return-1",
			depth: 0,
		});

		const first = await withTransaction(payload, (req) =>
			executeRefund(req, kase),
		);
		const fresh = await payload.findByID({
			collection: "return-cases",
			id: "return-1",
			depth: 0,
		});
		const second = await withTransaction(payload, (req) =>
			executeRefund(req, fresh),
		);

		expect(first).toMatchObject({
			order: "order-1",
			amount: 1_000,
			sourceType: "return-case",
			sourceId: "return-1",
		});
		expect(second?.id).toBe(first?.id);
		expect(payload.store.refunds).toHaveLength(1);
		expect(payload.store["return-cases"]?.[0]?.refund).toMatchObject({
			channel: "provider",
			providerRefund: first?.id,
		});
	});

	it("switches an expired provider window to seller-direct without creating a refund", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		const paidAt = new Date(NOW.getTime() - 86 * 24 * 60 * 60 * 1000);
		const payload = world(paidAt);
		const kase = await payload.findByID({
			collection: "return-cases",
			id: "return-1",
			depth: 0,
		});

		expect(
			await withTransaction(payload, (req) => executeRefund(req, kase)),
		).toBeNull();
		const fresh = await payload.findByID({
			collection: "return-cases",
			id: "return-1",
			depth: 0,
		});
		expect(fresh.refund?.channel).toBe("seller_direct");
		expect(
			await withTransaction(payload, (req) => executeRefund(req, fresh)),
		).toBeNull();
		expect(payload.store.refunds).toHaveLength(0);
	});
});

describe("advanceReturnRefunds overdue notification", () => {
	it("notifies the buyer and shop once after refundBy, including on repeated runs", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "delivered",
					paymentMethod: "cod",
					paymentStatus: "cod_collected",
					amounts: { subtotal: 1_000, total: 1_000 },
				},
			],
			"shop-members": [
				{
					id: "member-1",
					shop: "shop-1",
					user: "seller-1",
					role: "owner",
					status: "active",
				},
			],
			users: [
				{ id: "buyer-1", role: "user" },
				{ id: "seller-1", role: "user" },
			],
			"return-cases": [
				{
					id: "return-1",
					number: "RET-1",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "refund_pending",
					deadlines: {
						refundBy: new Date(NOW.getTime() - 60_000).toISOString(),
					},
					refund: { amount: 1_000, channel: "seller_direct" },
				},
			],
		});

		await advanceReturnRefunds(payload, NOW);
		await advanceReturnRefunds(payload, NOW);

		expect(notifyRefundOverdue).toHaveBeenCalledTimes(1);
		const deadlines = payload.store["return-cases"]?.[0]?.deadlines;
		if (!deadlines || typeof deadlines !== "object" || Array.isArray(deadlines))
			throw new Error("return case deadline fixture missing");
		expect((deadlines as Record<string, unknown>).refundOverdueNotifiedAt).toBe(
			NOW.toISOString(),
		);
	});
});

describe("seller-direct return refunds", () => {
	it("opens a seller-response dispute when the buyer contests refund proof", async () => {
		const payload = fakePayload(
			{
				orders: [
					{
						id: "order-1",
						orderNumber: "BNS-1",
						buyer: "buyer-1",
						shop: "shop-1",
						status: "delivered",
						paymentMethod: "cod",
						paymentStatus: "cod_collected",
						amounts: { subtotal: 2_000, deliveryFee: 0, total: 2_000 },
						timestamps: { deliveredAt: NOW.toISOString() },
					},
				],
				"order-items": [
					{
						id: "item-1",
						order: "order-1",
						title: "Item",
						quantity: 1,
						unitPrice: 2_000,
					},
				],
				"return-cases": [
					{
						id: "return-1",
						number: "RET-1",
						basis: "withdrawal",
						order: "order-1",
						shop: "shop-1",
						buyer: "buyer-1",
						openedByType: "buyer",
						status: "refund_pending",
						items: [{ orderItem: "item-1", quantity: 1 }],
						refund: {
							amount: 2_000,
							channel: "seller_direct",
							sellerProof: { evidence: "proof-1" },
						},
					},
				],
				disputes: [],
				"order-events": [],
			},
			{
				globals: {
					"app-settings": {
						disputes: {
							enabled: true,
							gates: [
								{ gate: "G2", evidence: "filed" },
								{ gate: "G3", evidence: "filed" },
							],
						},
					},
				},
			},
		);

		const result = await contestRefund(
			payload,
			{ id: "buyer-1", role: "user" },
			"return-1",
			NOW,
		);

		expect(result.kase.status).toBe("disputed");
		expect(result.kase.refund?.contestedAt).toBe(NOW.toISOString());
		expect(result.dispute).toMatchObject({
			subject: "refund",
			status: "awaiting_seller",
			openedByType: "buyer",
			deadlines: {
				respondBy: new Date(NOW.getTime() + 72 * 3_600_000).toISOString(),
			},
		});
		expect(payload.store.disputes).toHaveLength(1);
	});

	it("requires sufficient proof, then closes on buyer confirmation and releases the return hold", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "delivered",
					paymentMethod: "cod",
					paymentStatus: "cod_collected",
					completionHold: "return_case",
					returnCase: "return-1",
				},
			],
			"shop-members": [
				{
					id: "membership-1",
					shop: "shop-1",
					user: "seller-1",
					role: "owner",
					status: "active",
				},
			],
			"return-cases": [
				{
					id: "return-1",
					number: "RET-1",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "refund_pending",
					statusHistory: [{ status: "refund_pending", actorType: "system" }],
					refund: { amount: 2_000, channel: "seller_direct" },
				},
			],
			"dispute-evidence": [
				{
					id: "proof-1",
					returnCase: "return-1",
					uploadedBy: "seller-1",
					kind: "payment_proof",
				},
			],
			"order-events": [],
			"payout-holds": [
				{
					id: "hold-1",
					scope: "order",
					shop: "shop-1",
					order: "order-1",
					reason: "return_open",
					status: "active",
				},
			],
		});
		const seller = { id: "seller-1", role: "user" };
		const proof = {
			method: "cash" as const,
			amount: 2_000,
			evidenceIds: ["proof-1"],
		};

		await expect(
			submitRefundProof(payload, seller, "return-1", {
				...proof,
				amount: 1_999,
			}),
		).rejects.toMatchObject({ code: "return.refundProofInvalid" });
		const submitted = await submitRefundProof(
			payload,
			seller,
			"return-1",
			proof,
		);
		expect(submitted.refund?.sellerProof).toMatchObject({
			method: "cash",
			amount: 2_000,
			evidence: "proof-1",
		});

		const closed = await confirmRefund(
			payload,
			{ id: "buyer-1", role: "user" },
			"return-1",
		);
		expect(closed.status).toBe("closed");
		expect(closed.refund?.buyerConfirmedAt).toBeTruthy();
		expect(payload.store.orders?.[0]).toMatchObject({
			completionHold: "none",
			returnCase: null,
		});
		expect(payload.store["payout-holds"]?.[0]?.status).toBe("released");
		expect(payload.store["order-events"]?.[0]?.type).toBe(
			"order.return_refunded",
		);
	});

	it("credits the commission on closing, so the weekly invoice carries it", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-01T09:00:00.000Z"));
		const accruedAt = "2026-09-28T09:00:00.000Z";
		const payload = fakePayload({
			shops: [{ id: "shop-1", name: "Shop", handle: "shop" }],
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "delivered",
					paymentMethod: "cod",
					paymentStatus: "cod_collected",
				},
			],
			"return-cases": [
				{
					id: "return-1",
					number: "RET-1",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "refund_pending",
					refund: {
						amount: 40_000,
						channel: "seller_direct",
						breakdown: { goods: 40_000 },
						sellerProof: { evidence: "proof-1" },
					},
				},
			],
			"commission-lines": [
				{
					id: "cl-1",
					shop: "shop-1",
					order: "order-1",
					kind: "charge",
					paymentMethod: "cod",
					baseAmount: 40_000,
					amount: 3_200,
					status: "open",
					accruedAt,
				},
				{
					id: "cl-2",
					shop: "shop-1",
					order: "order-2",
					kind: "charge",
					paymentMethod: "cod",
					baseAmount: 45_000,
					amount: 3_600,
					status: "open",
					accruedAt,
				},
			],
			"commission-invoices": [],
			sequences: [],
			"order-events": [],
			"payout-holds": [],
		});

		await confirmRefund(payload, { id: "buyer-1", role: "user" }, "return-1");
		const issued = await issueInvoicesForWeek(
			payload,
			new Date("2026-10-06T09:00:00.000Z"),
		);

		expect(
			payload.store["commission-lines"]?.find((l) => l.kind === "credit"),
		).toMatchObject({
			order: "order-1",
			amount: 3_200,
			sourceType: "return-case",
			sourceId: "return-1",
		});
		expect(payload.store["commission-invoices"]?.[0]).toMatchObject({
			id: issued.issued[0],
			commissionTotal: 3_600,
			vatAmount: 693,
		});
	});
});
