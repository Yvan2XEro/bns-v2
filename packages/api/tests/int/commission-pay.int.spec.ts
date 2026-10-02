// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const createPayment = vi.fn();
vi.mock("../../src/lib/payments", () => ({
	getProvider: () => ({ createPayment }),
}));
const triggerNotificationEvent = vi.fn();
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: (...args: unknown[]) =>
		triggerNotificationEvent(...args),
	hasPushCredential: async () => true,
}));

import { ERROR_CODES } from "../../src/lib/errors";
import { payInvoice } from "../../src/services/commission";
import { settlePayment } from "../../src/services/payments";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const OWNER = { id: "u-owner", email: "owner@example.com", name: "Aicha" };

function world(invoice: Doc = {}, intents: Doc[] = []) {
	return fakePayload(
		{
			users: [{ id: "u-owner", role: "user", name: "Aicha" }],
			shops: [
				{
					id: "s-1",
					name: "Shop",
					handle: "shop",
					owner: "u-owner",
					status: "active",
				},
			],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
				},
			],
			"commission-invoices": [
				{
					id: "inv-1",
					invoiceNumber: "BNS-C-2026-000001",
					shop: "s-1",
					status: "issued",
					totalDue: 4_293,
					currency: "XAF",
					...invoice,
				},
			],
			"payment-intents": intents,
		},
		{ uniques: { "payment-intents": [["idempotencyKey"]] } },
	);
}

function intent(overrides: Doc): Doc {
	return {
		purpose: "commission",
		targetType: "commission-invoice",
		targetId: "inv-1",
		customer: "u-owner",
		amount: 4_293,
		currency: "XAF",
		provider: "notchpay",
		statusHistory: [],
		...overrides,
	};
}

const intentsOf = (p: FakePayload) => p.store["payment-intents"];

beforeEach(() => {
	createPayment.mockReset();
	triggerNotificationEvent.mockReset();
	createPayment.mockResolvedValue({
		checkoutUrl: "https://pay.test/new",
		providerReference: "trx.new",
	});
});

describe("payInvoice", () => {
	it("opens a fresh attempt after a failed one instead of colliding with its key", async () => {
		const payload = world({}, [
			intent({
				id: "pi-1",
				status: "failed",
				reference: "PI-pi-1",
				idempotencyKey: "commission:inv-1",
			}),
		]);

		const result = await payInvoice(payload, OWNER, "inv-1");

		expect(result).toEqual({ checkoutUrl: "https://pay.test/new" });
		expect(intentsOf(payload).map((i) => [i.status, i.idempotencyKey])).toEqual(
			[
				["failed", "commission:inv-1"],
				["pending", "commission:inv-1:2"],
			],
		);
	});

	it("hands back a live pending attempt rather than opening a second one", async () => {
		const payload = world({}, [
			intent({
				id: "pi-1",
				status: "pending",
				reference: "PI-pi-1",
				checkoutUrl: "https://pay.test/live",
				idempotencyKey: "commission:inv-1:1",
			}),
		]);

		const result = await payInvoice(payload, OWNER, "inv-1");

		expect(result).toEqual({ checkoutUrl: "https://pay.test/live" });
		expect(intentsOf(payload)).toHaveLength(1);
		expect(createPayment).toHaveBeenCalledTimes(0);
	});

	// `paid` keeps its own code — "already paid" is an answer, not a refusal —
	// while a written-off invoice is not payable at all.
	it("refuses a paid invoice with commission.alreadyPaid and opens nothing", async () => {
		const payload = world({ status: "paid" });

		await expect(payInvoice(payload, OWNER, "inv-1")).rejects.toMatchObject({
			code: ERROR_CODES.commissionAlreadyPaid,
			status: 409,
		});
		expect(intentsOf(payload)).toHaveLength(0);
	});

	it.each([
		"waived",
		"void",
	])("refuses a %s invoice with commission.notPayable and opens nothing", async (status) => {
		const payload = world({ status });

		await expect(payInvoice(payload, OWNER, "inv-1")).rejects.toMatchObject({
			code: ERROR_CODES.commissionNotPayable,
			status: 409,
		});
		expect(intentsOf(payload)).toHaveLength(0);
	});

	it("accepts an overdue invoice", async () => {
		const payload = world({ status: "overdue" });
		const result = await payInvoice(payload, OWNER, "inv-1");
		expect(result).toEqual({ checkoutUrl: "https://pay.test/new" });
		expect(intentsOf(payload).map((i) => i.idempotencyKey)).toEqual([
			"commission:inv-1:1",
		]);
	});
});

describe("commission settlement", () => {
	it("tells the shop's owner the invoice is paid", async () => {
		const payload = world({}, [
			intent({
				id: "pi-1",
				status: "pending",
				reference: "PI-pi-1",
				providerReference: "trx.c1",
				idempotencyKey: "commission:inv-1:1",
			}),
		]);

		await settlePayment(payload, {
			reference: "PI-pi-1",
			status: "succeeded",
			amount: 4_293,
			currency: "XAF",
			providerTransactionId: "trx.c1",
			source: "webhook",
		});

		expect(payload.store["commission-invoices"][0].status).toBe("paid");
		expect(triggerNotificationEvent.mock.calls.map(([arg]) => arg)).toEqual([
			{
				event: "commission-invoice-paid",
				subscriberId: "u-owner",
				payload: { invoiceId: "inv-1", invoiceNumber: "BNS-C-2026-000001" },
			},
		]);
	});
});
