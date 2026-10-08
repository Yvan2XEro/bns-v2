import { describe, expect, it } from "vitest";
import type { TransferEvent } from "../../src/lib/payments/marketplace";
import { withTransaction } from "../../src/lib/transactions";
import {
	applyResellerPayoutEvent,
	releaseResellerCommissions,
	retryResellerPayout,
} from "../../src/services/resellerPayouts";
import { fakePayload } from "./helpers/fakePayload";

const baseData = (invoiceStatus: string, activeReturn = false) => ({
	"reseller-commissions": [
		{
			id: "reseller-commission-1",
			resellerShop: "shop-reseller-1",
			order: "order-1",
			purchaseOrder: "purchase-order-1",
			status: "accrued",
			amount: 2_440,
		},
	],
	orders: [
		{
			id: "order-1",
			status: "completed",
			completionHold: null,
			timestamps: { deliveredAt: "2026-08-01T00:00:00.000Z" },
		},
	],
	"commission-lines": [
		{
			id: "margin-line-1",
			order: "order-1",
			kind: "resale_margin",
			invoice: "invoice-1",
		},
	],
	"commission-invoices": [{ id: "invoice-1", status: invoiceStatus }],
	"return-cases": activeReturn
		? [{ id: "return-1", order: "order-1", status: "received" }]
		: [],
	disputes: [],
});

describe("releaseResellerCommissions", () => {
	it("releases only after the completed order's withdrawal window and supplier invoice are settled", async () => {
		const payload = fakePayload(baseData("paid"), {
			globals: { "app-settings": { orders: { withdrawalDays: 15 } } },
		});

		const released = await releaseResellerCommissions(
			payload,
			new Date("2026-08-17T00:00:00.000Z"),
		);

		expect(released).toEqual(["reseller-commission-1"]);
		expect(payload.store["reseller-commissions"]?.[0]?.status).toBe("payable");
	});

	it("keeps commissions accrued when the invoice is unpaid or the withdrawal window is open", async () => {
		const unpaid = fakePayload(baseData("issued"), {
			globals: { "app-settings": { orders: { withdrawalDays: 15 } } },
		});
		const withinWindow = fakePayload(baseData("paid"), {
			globals: { "app-settings": { orders: { withdrawalDays: 15 } } },
		});

		const unpaidResult = await releaseResellerCommissions(
			unpaid,
			new Date("2026-08-17T00:00:00.000Z"),
		);
		const windowResult = await releaseResellerCommissions(
			withinWindow,
			new Date("2026-08-10T00:00:00.000Z"),
		);

		expect(unpaidResult).toEqual([]);
		expect(unpaid.store["reseller-commissions"]?.[0]?.status).toBe("accrued");
		expect(windowResult).toEqual([]);
		expect(withinWindow.store["reseller-commissions"]?.[0]?.status).toBe(
			"accrued",
		);
	});

	it("keeps commissions accrued while a return or dispute is active", async () => {
		const payload = fakePayload(baseData("paid", true), {
			globals: { "app-settings": { orders: { withdrawalDays: 15 } } },
		});

		const released = await releaseResellerCommissions(
			payload,
			new Date("2026-08-17T00:00:00.000Z"),
		);

		expect(released).toEqual([]);
		expect(payload.store["reseller-commissions"]?.[0]?.status).toBe("accrued");
	});
});

describe("applyResellerPayoutEvent", () => {
	const transferEvent = (status: TransferEvent["status"]): TransferEvent => ({
		entity: "transfer",
		status,
		reference: "RP-0001",
		transferId: "transfer-1",
		accountId: "",
		amount: 1_000,
		currency: "XAF",
		fee: null,
		failureReason: status === "failed" ? "rejected" : null,
		providerTransactionId: "transfer-1",
		providerEventId: "transfer-event-1",
		type: `transfer/${status}`,
	});

	it("marks commissions paid exactly once when a transfer completes", async () => {
		const payload = fakePayload({
			"reseller-payouts": [
				{
					id: "payout-1",
					reference: "RP-0001",
					status: "sent",
					commissions: ["commission-1"],
					charges: ["charge-1"],
					statusHistory: [],
				},
			],
			"reseller-commissions": [
				{ id: "commission-1", status: "payable", payout: "payout-1" },
			],
			"reseller-charges": [
				{ id: "charge-1", status: "offset", offsetBy: "payout-1" },
			],
		});

		const first = await withTransaction(payload, (req) =>
			applyResellerPayoutEvent(req, transferEvent("complete")),
		);
		const replay = await withTransaction(payload, (req) =>
			applyResellerPayoutEvent(req, transferEvent("complete")),
		);

		expect(first).toBe("applied");
		expect(replay).toBe("unchanged");
		expect(payload.store["reseller-commissions"]?.[0]).toMatchObject({
			status: "paid",
			paidAt: expect.any(String),
		});
	});

	it("releases reserved commissions and charges after a failed transfer", async () => {
		const payload = fakePayload({
			"reseller-payouts": [
				{
					id: "payout-1",
					reference: "RP-0001",
					status: "sent",
					commissions: ["commission-1"],
					charges: ["charge-1"],
					statusHistory: [],
				},
			],
			"reseller-commissions": [
				{ id: "commission-1", status: "payable", payout: "payout-1" },
			],
			"reseller-charges": [
				{ id: "charge-1", status: "offset", offsetBy: "payout-1" },
			],
		});

		const result = await withTransaction(payload, (req) =>
			applyResellerPayoutEvent(req, transferEvent("failed")),
		);

		expect(result).toBe("applied");
		expect(payload.store["reseller-commissions"]?.[0]).toMatchObject({
			status: "payable",
			payout: null,
		});
		expect(payload.store["reseller-charges"]?.[0]).toMatchObject({
			status: "open",
			offsetBy: null,
		});
	});

	it("releases the payable amounts if a completed transfer is reversed", async () => {
		const payload = fakePayload({
			"reseller-payouts": [
				{
					id: "payout-1",
					reference: "RP-0001",
					status: "complete",
					commissions: ["commission-1"],
					charges: ["charge-1"],
					statusHistory: [],
				},
			],
			"reseller-commissions": [
				{ id: "commission-1", status: "paid", payout: "payout-1" },
			],
			"reseller-charges": [
				{ id: "charge-1", status: "offset", offsetBy: "payout-1" },
			],
		});

		const result = await withTransaction(payload, (req) =>
			applyResellerPayoutEvent(req, transferEvent("reversed")),
		);

		expect(result).toBe("applied");
		expect(payload.store["reseller-commissions"]?.[0]).toMatchObject({
			status: "payable",
			payout: null,
			paidAt: null,
		});
		expect(payload.store["reseller-charges"]?.[0]).toMatchObject({
			status: "open",
			offsetBy: null,
		});
	});
});

describe("retryResellerPayout", () => {
	it("refuses payout retries from ordinary authenticated users", async () => {
		const payload = fakePayload({
			"reseller-payouts": [
				{ id: "payout-1", reference: "RP-0001", status: "pending" },
			],
		});

		await expect(
			retryResellerPayout(payload, { id: "user-1", role: "user" }, "payout-1"),
		).rejects.toMatchObject({ status: 403 });
		expect(payload.store["reseller-payouts"]?.[0]?.status).toBe("pending");
	});
});
