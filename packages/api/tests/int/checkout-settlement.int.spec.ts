// @vitest-environment node
import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notifications = vi.hoisted(() => ({
	notifyPaymentSucceeded: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyOrderPaid: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyPaymentFailed: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyRefundInitiated: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyRefundCompleted: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyRefundFailed: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyRefundStaffAlert: vi.fn(async (_p: unknown, _n: unknown) => {}),
}));
vi.mock("../../src/services/paymentNotifications", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/paymentNotifications")
	>()),
	...notifications,
}));

const invoices = vi.hoisted(() => ({
	issueBuyerFeeInvoice: vi.fn(
		async (
			_req: unknown,
			_order: unknown,
			_intent: unknown,
		): Promise<unknown> => undefined,
	),
	issueApplicationFeeCommissionInvoice: vi.fn(
		async (_req: unknown, _order: unknown) => {},
	),
}));
vi.mock("../../src/services/buyerFeeInvoices", () => invoices);

// P4's own order notices run on the same dispatch; keep them off the network.
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async () => {}),
	hasPushCredential: vi.fn(async () => false),
	syncNotificationSubscriber: vi.fn(async () => {}),
	buildExpoPushData: vi.fn(() => ({})),
}));
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: vi.fn(async () => ({ status: "sent" })),
}));

import { expireOrders } from "../../src/jobs/expireOrders";
import { ERROR_CODES } from "../../src/lib/errors";
import { splitAmounts } from "../../src/lib/paymentMath";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
} from "../../src/lib/paymentSettings";
import type { RefundEvent } from "../../src/lib/payments/marketplace";
import { withTransaction } from "../../src/lib/transactions";
import type {
	LedgerTransaction,
	Order,
	OrderEvent,
	PaymentIntent,
	Refund,
} from "../../src/payload-types";
import {
	cancellationRefundReason,
	refundOnOrderCancelled,
	settleCheckoutIntent,
} from "../../src/services/checkoutSettlement";
import { intentBalances, orderBalances } from "../../src/services/ledger";
import {
	applyStatus,
	failIntentBeforeProvider,
	type StatusReport,
} from "../../src/services/payments";
import { applyRefundEvent } from "../../src/services/refunds";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (offsetMs: number) =>
	new Date(NOW.getTime() + offsetMs).toISOString();

const MARKET = DEFAULT_MARKETS[0];
const CURRENCY = MARKET.currency;
const SHOP = "s-1";
const BUYER = "u-buyer";
const OWNER = "u-owner";

/** The ledger spec's worked order: G 48 410, D 43 240, C 3 153 + 607, P 1 410 (VAT 228). */
const SPLIT = splitAmounts({
	orderTotal: 47_000,
	commission: 3_153,
	vatRateBps: MARKET.vatRateBps,
	protection: PAYMENT_DEFAULTS.buyerProtection,
});
const G = SPLIT.buyerTotal;
const D = SPLIT.destinationAmount;

function orderDoc(overrides: Doc = {}): Doc {
	return {
		id: "o-1",
		orderNumber: "BNS-2610-000001",
		buyer: BUYER,
		shop: SHOP,
		status: "placed",
		paymentMethod: "mobile_money",
		paymentStatus: "awaiting_payment",
		delivery: {
			method: "seller_delivery",
			recipientName: "Awa",
			phone: "+237670000001",
			city: "douala",
		},
		amounts: {
			subtotal: 45_000,
			deliveryFee: 2_000,
			discount: 0,
			total: G,
			currency: CURRENCY,
			buyerProtectionFee: SPLIT.buyerProtectionFee,
			buyerProtectionFeeVat: SPLIT.buyerProtectionFeeVat,
			commission: SPLIT.commission,
			commissionVat: SPLIT.commissionVat,
			applicationFee: SPLIT.applicationFee,
			destinationAmount: D,
		},
		settlement: {
			mode: "provider_split",
			releaseModel: "provider_hold",
			connectedAccount: "ca-1",
			refundedAmount: 0,
		},
		deadlines: {},
		timestamps: { placedAt: at(-10 * MIN) },
		contract: { locale: "fr" },
		confirmation: {},
		cancellation: {},
		handover: {},
		deliveryFailure: {},
		completionHold: "none",
		createdAt: at(-10 * MIN),
		updatedAt: at(-10 * MIN),
		...overrides,
	};
}

function intentDoc(id: string, overrides: Doc = {}): Doc {
	return {
		id,
		purpose: "checkout",
		targetType: "order",
		targetId: "o-1",
		customer: BUYER,
		amount: G,
		currency: CURRENCY,
		provider: "notchpay",
		reference: `PI-${id}`,
		providerReference: `np-${id}`,
		idempotencyKey: `checkout:${BUYER}:${id}`,
		status: "pending",
		statusHistory: [
			{ status: "created", source: "system", at: at(-9 * MIN) },
			{ status: "pending", source: "system", at: at(-9 * MIN) },
		],
		attempt: 1,
		channel: "cm.mtn",
		payerPhone: "+237670000001",
		connectedAccount: "ca-1",
		destinationAmount: D,
		applicationFee: SPLIT.applicationFee,
		expiresAt: at(20 * MIN),
		lateSuccess: false,
		createdAt: at(-9 * MIN),
		updatedAt: at(-9 * MIN),
		...overrides,
	};
}

let payload: FakePayload;

function world(seed: Record<string, Doc[]> = {}): FakePayload {
	payload = fakePayload(
		{
			users: [
				{ id: BUYER, role: "user" },
				{ id: OWNER, role: "user" },
			],
			shops: [
				{ id: SHOP, name: "Akwa", owner: OWNER, status: "active", stats: {} },
			],
			orders: [orderDoc()],
			"order-items": [
				{
					id: "item-1",
					order: "o-1",
					product: "p-1",
					variant: "v-1",
					fulfillingShop: SHOP,
					quantity: 1,
					unitPrice: 45_000,
					lineSubtotal: 45_000,
					fulfillmentStatus: "unfulfilled",
				},
			],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: SHOP,
					trackInventory: true,
					stockOnHand: 4,
					stockReserved: 1,
				},
			],
			"stock-movements": [],
			"order-events": [],
			"payment-intents": [intentDoc("pi-1")],
			refunds: [],
			"payout-holds": [],
			"reconciliation-mismatches": [],
			...seed,
		},
		{
			uniques: {
				refunds: [["idempotencyKey"]],
				"ledger-accounts": [["key"]],
				"ledger-transactions": [["idempotencyKey"]],
			},
		},
	);
	return payload;
}

const success = (overrides: Partial<StatusReport> = {}): StatusReport => ({
	status: "succeeded",
	source: "webhook",
	at: NOW,
	amount: G,
	currency: CURRENCY,
	...overrides,
});

const order = (): Order => payload.store.orders[0] as unknown as Order;
const intent = (id: string): PaymentIntent =>
	payload.store["payment-intents"].find(
		(row) => row.id === id,
	) as unknown as PaymentIntent;
const transactions = () =>
	(payload.store["ledger-transactions"] ??
		[]) as unknown as LedgerTransaction[];
const refunds = () => payload.store.refunds as unknown as Refund[];
const events = () => payload.store["order-events"];
const mismatches = () => payload.store["reconciliation-mismatches"];

/** A stored posting's lines, keyed back to their account keys. */
function linesOf(transaction: LedgerTransaction) {
	const accounts = payload.store["ledger-accounts"];
	return transaction.entries.map((entry) => ({
		account: accounts.find((a) => a.id === entry.account)?.key,
		debit: entry.debit,
		credit: entry.credit,
	}));
}

const CHARGE_LINES = [
	{
		account: `provider_position:platform:${CURRENCY}`,
		debit: 48_410,
		credit: 0,
	},
	{ account: `seller_pending:${SHOP}:${CURRENCY}`, debit: 0, credit: 43_240 },
	{
		account: `platform_fee_unearned:platform:${CURRENCY}`,
		debit: 0,
		credit: 3_760,
	},
	{
		account: `platform_revenue_protection_fee:platform:${CURRENCY}`,
		debit: 0,
		credit: 1_182,
	},
	{ account: `vat_payable:platform:${CURRENCY}`, debit: 0, credit: 228 },
];

function chargeOf(intentId: string) {
	const found = transactions().filter(
		(t) => t.kind === "charge" && t.paymentIntent === intentId,
	);
	expect(found).toHaveLength(1);
	return found[0];
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	vi.clearAllMocks();
	world();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("a matching success", () => {
	it("pays the order, starts the 48 h acceptance clock from paidAt, posts the charge with the order, notifies and invoices", async () => {
		const result = await applyStatus(payload, "pi-1", success());

		expect(result.outcome).toBe("applied");
		expect(intent("pi-1").status).toBe("succeeded");
		const paid = order();
		expect([paid.status, paid.paymentStatus]).toEqual(["paid", "paid"]);
		expect(paid.deadlines?.acceptBy).toBe(at(48 * HOUR));

		expect(
			events().map((e) => ({
				type: e.type,
				statusFrom: e.statusFrom,
				statusTo: e.statusTo,
				paymentStatusFrom: e.paymentStatusFrom,
				paymentStatusTo: e.paymentStatusTo,
				actorType: e.actorType,
				visibility: e.visibility,
				reason: e.reason,
				metadata: e.metadata,
				source: e.source,
			})),
		).toEqual([
			{
				type: "order.note_added",
				statusFrom: "placed",
				statusTo: "paid",
				paymentStatusFrom: "awaiting_payment",
				paymentStatusTo: "paid",
				actorType: "system",
				visibility: "both",
				reason: "payment_succeeded",
				metadata: { intentId: "pi-1", amount: G, currency: CURRENCY },
				source: "webhook",
			},
		]);

		expect(transactions()).toHaveLength(1);
		const charge = chargeOf("pi-1");
		expect({
			kind: charge.kind,
			order: charge.order,
			shop: charge.shop,
			paymentIntent: charge.paymentIntent,
			sourceType: charge.sourceType,
			sourceId: charge.sourceId,
			idempotencyKey: charge.idempotencyKey,
		}).toEqual({
			kind: "charge",
			order: "o-1",
			shop: SHOP,
			paymentIntent: "pi-1",
			sourceType: "webhook-event",
			sourceId: "pi-1",
			idempotencyKey: "webhook-event:pi-1:charge",
		});
		expect(linesOf(charge)).toEqual(CHARGE_LINES);
		const balances = await withTransaction(payload, (req) =>
			orderBalances(req, "o-1"),
		);
		expect(balances.seller_pending).toBe(D);

		const notice = {
			orderId: "o-1",
			orderNumber: "BNS-2610-000001",
			intentId: "pi-1",
			buyerId: BUYER,
			shopId: SHOP,
			amount: G,
			currency: CURRENCY,
		};
		expect(notifications.notifyPaymentSucceeded.mock.calls).toEqual([
			[payload, notice],
		]);
		expect(notifications.notifyOrderPaid.mock.calls).toEqual([
			[payload, { ...notice, acceptBy: at(48 * HOUR) }],
		]);
		expect(invoices.issueBuyerFeeInvoice).toHaveBeenCalledTimes(1);
		const [, invoicedOrder, invoicedIntent] =
			invoices.issueBuyerFeeInvoice.mock.calls[0];
		expect([
			(invoicedOrder as Order).id,
			(invoicedOrder as Order).paymentStatus,
			(invoicedIntent as PaymentIntent).id,
		]).toEqual(["o-1", "paid", "pi-1"]);
		expect(refunds()).toHaveLength(0);
	});

	it("does nothing more when the same success arrives again, from the webhook or from reconciliation — but retries the invoice", async () => {
		await applyStatus(payload, "pi-1", success());
		const again = await applyStatus(payload, "pi-1", success());
		const reconciled = await applyStatus(
			payload,
			"pi-1",
			success({ source: "reconcile" }),
		);

		expect([again.outcome, reconciled.outcome]).toEqual([
			"unchanged",
			"unchanged",
		]);
		expect(transactions().map((t) => t.kind)).toEqual(["charge"]);
		expect(events()).toHaveLength(1);
		expect(notifications.notifyPaymentSucceeded).toHaveBeenCalledTimes(1);
		expect(notifications.notifyOrderPaid).toHaveBeenCalledTimes(1);
		// Task 22: the invoice is idempotent per order, so every replay of the
		// settling payment re-asks for it — the retry a failed first issue gets.
		expect(
			invoices.issueBuyerFeeInvoice.mock.calls.map(([, o, i]) => [
				(o as Order).id,
				(o as Order).paymentStatus,
				(i as PaymentIntent).id,
			]),
		).toEqual([
			["o-1", "paid", "pi-1"],
			["o-1", "paid", "pi-1"],
			["o-1", "paid", "pi-1"],
		]);
	});

	it("leaves one invoice row, with one number, after the success is replayed twice", async () => {
		const actual = await vi.importActual<
			typeof import("../../src/services/buyerFeeInvoices")
		>("../../src/services/buyerFeeInvoices");
		invoices.issueBuyerFeeInvoice.mockImplementation((req, o, i) =>
			actual.issueBuyerFeeInvoice(
				req as PayloadRequest,
				o as Order,
				i as PaymentIntent,
			),
		);
		try {
			await applyStatus(payload, "pi-1", success());
			await applyStatus(payload, "pi-1", success());
			await applyStatus(payload, "pi-1", success({ source: "reconcile" }));
			const issued = await Promise.all(
				invoices.issueBuyerFeeInvoice.mock.results.map((r) => r.value),
			);

			expect(payload.store["buyer-fee-invoices"]).toHaveLength(1);
			expect(
				issued.map((invoice) => (invoice as { number: string }).number),
			).toEqual([
				"BNS-F-2026-000001",
				"BNS-F-2026-000001",
				"BNS-F-2026-000001",
			]);
		} finally {
			// Back to the hoisted no-op, so the real body does not outlive this test.
			invoices.issueBuyerFeeInvoice.mockReset();
		}
	});

	it("keeps the paid order when the invoice cannot be issued", async () => {
		invoices.issueBuyerFeeInvoice.mockRejectedValueOnce(new Error("no PDF"));

		await applyStatus(payload, "pi-1", success());

		expect([order().status, order().paymentStatus]).toEqual(["paid", "paid"]);
		expect(transactions().map((t) => t.kind)).toEqual(["charge"]);
		expect(invoices.issueBuyerFeeInvoice).toHaveBeenCalledTimes(1);
		expect(payload.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ err: expect.any(Error) }),
			"[checkout-settlement] after-commit work failed",
		);
	});
});

describe("a success the order did not need", () => {
	it("refunds a second succeeded intent as duplicate_payment, against that intent alone and off the order's ledger", async () => {
		world({
			"payment-intents": [
				intentDoc("pi-1"),
				intentDoc("pi-2", { attempt: 2, createdAt: at(-5 * MIN) }),
			],
		});
		await applyStatus(payload, "pi-1", success());
		const second = await applyStatus(payload, "pi-2", success());

		expect(second.outcome).toBe("applied");
		expect(intent("pi-2").status).toBe("succeeded");
		expect([order().status, order().paymentStatus]).toEqual(["paid", "paid"]);
		expect(order().settlement?.refundedAmount).toBe(0);
		expect(events()).toHaveLength(1);

		const duplicate = chargeOf("pi-2");
		expect([
			duplicate.order ?? null,
			duplicate.shop,
			duplicate.idempotencyKey,
		]).toEqual([null, SHOP, "webhook-event:pi-2:charge"]);
		expect(linesOf(duplicate)).toEqual(CHARGE_LINES);

		expect(
			refunds().map((r) => ({
				order: r.order,
				paymentIntent: r.paymentIntent,
				amount: r.amount,
				reason: r.reason,
				sourceType: r.sourceType,
				sourceId: r.sourceId,
				idempotencyKey: r.idempotencyKey,
				status: r.status,
			})),
		).toEqual([
			{
				order: "o-1",
				paymentIntent: "pi-2",
				amount: G,
				reason: "duplicate_payment",
				sourceType: "payment-intent",
				sourceId: "pi-2",
				idempotencyKey: "payment-intent:pi-2:1",
				status: "created",
			},
		]);
		expect(notifications.notifyRefundInitiated).toHaveBeenCalledTimes(1);
		expect(notifications.notifyPaymentSucceeded).toHaveBeenCalledTimes(1);
		expect(invoices.issueBuyerFeeInvoice).toHaveBeenCalledTimes(1);

		// The duplicate never reaches the D′ that `release` would pay out, and
		// its refund nets against its own charge, not the order's.
		const before = await withTransaction(payload, (req) =>
			orderBalances(req, "o-1"),
		);
		expect(before.seller_pending).toBe(D);
		const refundEvent: RefundEvent = {
			entity: "refund",
			status: "pending",
			refundId: "rf-np-1",
			paymentReference: "PI-pi-2",
			accountId: null,
			fee: null,
			reference: "payment-intent:pi-2:1",
			amount: G,
			currency: CURRENCY,
			providerTransactionId: null,
			providerEventId: "evt-refund-1",
			type: "refund.pending",
		};
		await withTransaction(payload, (req) => applyRefundEvent(req, refundEvent));
		const after = await withTransaction(payload, async (req) => ({
			order: await orderBalances(req, "o-1"),
			duplicate: await intentBalances(req, "pi-2"),
		}));
		expect(after.order.seller_pending).toBe(D);
		expect(after.order.seller_receivable ?? 0).toBe(0);
		expect(after.duplicate.seller_pending).toBe(0);
		expect(after.duplicate.seller_receivable ?? 0).toBe(0);
		const submitted = transactions().find((t) => t.kind === "refund_submitted");
		expect(submitted?.order ?? null).toBeNull();
	});

	it("refunds a success on an order already cancelled by the checkout window as late_payment", async () => {
		vi.setSystemTime(new Date(NOW.getTime() + 20 * MIN));
		const swept = await expireOrders(payload);
		expect(swept.paymentExpired).toBe(1);
		expect([order().status, order().paymentStatus]).toEqual([
			"cancelled",
			"failed",
		]);

		const result = await applyStatus(
			payload,
			"pi-1",
			success({ at: new Date(NOW.getTime() + 21 * MIN) }),
		);

		expect(result.outcome).toBe("applied");
		expect(intent("pi-1").status).toBe("succeeded");
		expect([order().status, order().paymentStatus]).toEqual([
			"cancelled",
			"failed",
		]);
		const charge = chargeOf("pi-1");
		expect(charge.order ?? null).toBeNull();
		expect(
			refunds().map((r) => [r.reason, r.sourceType, r.sourceId, r.amount]),
		).toEqual([["late_payment", "payment-intent", "pi-1", G]]);
		expect(notifications.notifyPaymentSucceeded).not.toHaveBeenCalled();
		expect(invoices.issueBuyerFeeInvoice).not.toHaveBeenCalled();
	});
});

describe("Review Focus 1: a success on a closed intent", () => {
	it.each([
		"expired",
		"cancelled",
		"failed",
	] as const)("on a %s intent: status kept, one lateSuccess, one charge, one late_payment refund — and a second delivery does nothing more", async (status) => {
		world({
			"payment-intents": [
				intentDoc("pi-1", {
					status,
					statusHistory: [
						{ status: "created", source: "system", at: at(-40 * MIN) },
						{ status: "pending", source: "system", at: at(-40 * MIN) },
						{ status, source: "system", at: at(-10 * MIN) },
					],
				}),
			],
		});

		const first = await applyStatus(payload, "pi-1", success());
		const second = await applyStatus(payload, "pi-1", success());

		expect([first.outcome, second.outcome]).toEqual([
			"late_success",
			"unchanged",
		]);
		const late = intent("pi-1");
		expect([late.status, late.lateSuccess]).toEqual([status, true]);
		expect(
			(late.statusHistory ?? []).map((h) => [h.status, h.note ?? null]),
		).toEqual([
			["created", null],
			["pending", null],
			[status, null],
			["succeeded", `late success: intent is ${status}`],
		]);
		expect(transactions().map((t) => t.kind)).toEqual(["charge"]);
		const charge = chargeOf("pi-1");
		expect(charge.order ?? null).toBeNull();
		expect(linesOf(charge)).toEqual(CHARGE_LINES);
		expect(
			refunds().map((r) => [
				r.reason,
				r.sourceType,
				r.sourceId,
				r.paymentIntent,
				r.amount,
			]),
		).toEqual([["late_payment", "payment-intent", "pi-1", "pi-1", G]]);
		expect(notifications.notifyRefundInitiated).toHaveBeenCalledTimes(1);
		// This intent did not pay the order.
		expect([order().status, order().paymentStatus]).toEqual([
			"placed",
			"awaiting_payment",
		]);
		expect(events()).toHaveLength(0);
	});
});

describe("an amount or currency that is not the intent's", () => {
	it.each([
		["amount", { amount: G - 1 }, { amount: G - 1, currency: CURRENCY }],
		["currency", { currency: "EUR" }, { amount: G, currency: "EUR" }],
	] as const)("settles nothing on a mismatched %s and opens one alert", async (_label, report, actual) => {
		await applyStatus(payload, "pi-1", success(report));
		const again = await applyStatus(payload, "pi-1", success(report));

		expect(again.outcome).toBe("amount_mismatch");
		expect([intent("pi-1").status, intent("pi-1").lateSuccess]).toEqual([
			"pending",
			false,
		]);
		expect([order().status, order().paymentStatus]).toEqual([
			"placed",
			"awaiting_payment",
		]);
		expect(transactions()).toHaveLength(0);
		expect(refunds()).toHaveLength(0);
		expect(events()).toHaveLength(0);
		expect(notifications.notifyPaymentSucceeded).not.toHaveBeenCalled();
		expect(
			mismatches().map((m) => ({
				kind: m.kind,
				entityType: m.entityType,
				localId: m.localId,
				providerId: m.providerId,
				expected: m.expected,
				actual: m.actual,
				shop: m.shop,
				status: m.status,
			})),
		).toEqual([
			{
				kind: "amount_mismatch",
				entityType: "payment-intent",
				localId: "pi-1",
				providerId: "np-pi-1",
				expected: { amount: G, currency: CURRENCY },
				actual,
				shop: SHOP,
				status: "open",
			},
		]);
		expect(payload.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				code: ERROR_CODES.paymentAmountMismatch,
				intentId: "pi-1",
			}),
		);
	});

	it("does not flag a late success whose amount is wrong", async () => {
		world({ "payment-intents": [intentDoc("pi-1", { status: "expired" })] });

		const result = await applyStatus(
			payload,
			"pi-1",
			success({ amount: G + 100 }),
		);

		expect(result.outcome).toBe("amount_mismatch");
		expect([intent("pi-1").status, intent("pi-1").lateSuccess]).toEqual([
			"expired",
			false,
		]);
		expect(transactions()).toHaveLength(0);
		expect(refunds()).toHaveLength(0);
		expect(mismatches().map((m) => [m.kind, m.localId])).toEqual([
			["amount_mismatch", "pi-1"],
		]);
	});
});

describe("a failure", () => {
	const failure = (failureCode: StatusReport["failureCode"]): StatusReport => ({
		status: "failed",
		source: "webhook",
		at: NOW,
		failureCode,
	});

	it("keeps the order awaiting payment while attempts and the window remain", async () => {
		const result = await applyStatus(payload, "pi-1", failure("declined"));

		expect(result.outcome).toBe("applied");
		expect([intent("pi-1").status, intent("pi-1").failureCode]).toEqual([
			"failed",
			"declined",
		]);
		expect([order().status, order().paymentStatus]).toEqual([
			"placed",
			"awaiting_payment",
		]);
		expect(events()).toHaveLength(0);
		expect(payload.store["stock-movements"]).toHaveLength(0);
		expect(notifications.notifyPaymentFailed).not.toHaveBeenCalled();
	});

	it.each([
		["the third attempt fails", { attempt: 3 }, {}],
		[
			"the checkout window has closed",
			{ attempt: 1 },
			{ timestamps: { placedAt: at(-30 * MIN) } },
		],
	] as const)("fails the payment and cancels the order when %s", async (_label, intentOverrides, orderOverrides) => {
		world({
			orders: [orderDoc(orderOverrides)],
			"payment-intents": [intentDoc("pi-1", intentOverrides)],
		});

		await applyStatus(payload, "pi-1", failure("insufficient_funds"));

		expect([intent("pi-1").status, intent("pi-1").failureCode]).toEqual([
			"failed",
			"insufficient_funds",
		]);
		const dead = order();
		expect([dead.status, dead.paymentStatus]).toEqual(["cancelled", "failed"]);
		expect(dead.cancellation).toEqual({
			by: "system",
			reason: "payment_expired",
			note: null,
		});
		expect(events().map((e) => [e.type, e.reason])).toEqual([
			["order.cancelled", "payment_expired"],
		]);
		expect(
			payload.store["stock-movements"].map((m) => [m.type, m.order]),
		).toEqual([["release", "o-1"]]);
		expect(payload.store["product-variants"][0].stockReserved).toBe(0);
		expect(notifications.notifyPaymentFailed.mock.calls).toEqual([
			[
				payload,
				{
					orderId: "o-1",
					orderNumber: "BNS-2610-000001",
					intentId: "pi-1",
					buyerId: BUYER,
					shopId: SHOP,
					amount: G,
					currency: CURRENCY,
					status: "failed",
					failureCode: "insufficient_funds",
				},
			],
		]);
		// The cancellation dispatch reached the refund handler, which found
		// nothing paid to give back.
		expect(refunds()).toHaveLength(0);
	});

	it("takes an expiry straight to the final branch", async () => {
		await applyStatus(payload, "pi-1", {
			status: "expired",
			source: "system",
			at: NOW,
		});

		expect([order().status, order().paymentStatus]).toEqual([
			"cancelled",
			"failed",
		]);
		expect(notifications.notifyPaymentFailed.mock.calls[0][1]).toMatchObject({
			status: "expired",
			failureCode: null,
		});
	});

	it("leaves the order to a newer attempt still in flight", async () => {
		world({
			"payment-intents": [
				intentDoc("pi-1"),
				intentDoc("pi-2", { status: "pending", attempt: 2 }),
			],
		});

		await applyStatus(payload, "pi-1", {
			status: "expired",
			source: "system",
			at: NOW,
		});

		expect(intent("pi-1").status).toBe("expired");
		expect([order().status, order().paymentStatus]).toEqual([
			"placed",
			"awaiting_payment",
		]);
		expect(notifications.notifyPaymentFailed).not.toHaveBeenCalled();
	});

	it("routes a provider failure at creation through the same branch (Task 13's last attempt)", async () => {
		world({
			"payment-intents": [
				intentDoc("pi-1", {
					status: "created",
					attempt: 3,
					statusHistory: [
						{ status: "created", source: "system", at: at(-1 * MIN) },
					],
				}),
			],
		});

		const failed = await failIntentBeforeProvider(payload, "pi-1", {
			failureCode: "provider_error",
			now: NOW,
		});

		expect(failed?.status).toBe("failed");
		expect([order().status, order().paymentStatus]).toEqual([
			"cancelled",
			"failed",
		]);
		expect(notifications.notifyPaymentFailed.mock.calls[0][1]).toMatchObject({
			status: "failed",
			failureCode: "provider_error",
		});
	});

	it("does nothing for a cancelled intent", async () => {
		const outcome = await withTransaction(payload, (req) =>
			settleCheckoutIntent(req, {
				...intent("pi-1"),
				status: "cancelled",
			}),
		);

		expect(outcome).toBe("unchanged");
		expect([order().status, order().paymentStatus]).toEqual([
			"placed",
			"awaiting_payment",
		]);
	});
});

describe("refund on cancellation", () => {
	const cancelledEvent = (id: string): OrderEvent => ({
		id,
		order: "o-1",
		type: "order.cancelled",
		visibility: "both",
		createdAt: NOW.toISOString(),
		updatedAt: NOW.toISOString(),
	});
	async function paidOrder(): Promise<void> {
		await applyStatus(payload, "pi-1", success());
		vi.clearAllMocks();
	}

	it("refunds the full buyerTotal as acceptance_timeout when the 48 h run out", async () => {
		await paidOrder();
		vi.setSystemTime(new Date(NOW.getTime() + 48 * HOUR));

		const swept = await expireOrders(payload);

		expect(swept.sellerTimedOut).toBe(1);
		expect([order().status, order().paymentStatus]).toEqual([
			"cancelled",
			"paid",
		]);
		expect(order().cancellation?.reason).toBe("seller_timeout");
		expect(
			refunds().map((r) => ({
				reason: r.reason,
				sourceType: r.sourceType,
				sourceId: r.sourceId,
				paymentIntent: r.paymentIntent,
				amount: r.amount,
				breakdown: r.breakdown,
			})),
		).toEqual([
			{
				reason: "acceptance_timeout",
				sourceType: "order",
				sourceId: "o-1",
				paymentIntent: "pi-1",
				amount: G,
				breakdown: {
					seller: D,
					commission: SPLIT.commission,
					commissionVat: SPLIT.commissionVat,
					buyerProtectionFee: SPLIT.buyerProtectionFee,
				},
			},
		]);
		expect(order().settlement?.refundedAmount).toBe(G);
		expect(notifications.notifyRefundInitiated).toHaveBeenCalledTimes(1);
	});

	it("asks once when the handler is retried", async () => {
		await paidOrder();
		const cancelled: Order = {
			...order(),
			status: "cancelled",
			cancellation: { by: "buyer", reason: "buyer_changed_mind" },
		};
		const event = cancelledEvent("ev-x");

		await refundOnOrderCancelled(payload, cancelled, event);
		await refundOnOrderCancelled(payload, cancelled, event);

		expect(refunds().map((r) => [r.reason, r.amount])).toEqual([
			["order_cancelled", G],
		]);
		expect(order().settlement?.refundedAmount).toBe(G);
	});

	it.each([
		[{ by: "seller", reason: "seller_out_of_stock" }, "seller_declined"],
		[{ by: "system", reason: "seller_timeout" }, "acceptance_timeout"],
		[{ by: "buyer", reason: "buyer_changed_mind" }, "order_cancelled"],
		[{ by: "staff", reason: "staff_fraud" }, "order_cancelled"],
	] as const)("maps %o to %s", (cancellation, reason) => {
		expect(cancellationRefundReason({ cancellation })).toBe(reason);
	});

	it.each([
		["a COD order", { paymentMethod: "cod", paymentStatus: "cod_pending" }],
		["an unpaid protected order", { paymentStatus: "failed" }],
	] as const)("refunds nothing for %s", async (_label, overrides) => {
		await refundOnOrderCancelled(
			payload,
			{ ...order(), ...overrides, status: "cancelled" },
			cancelledEvent("ev-y"),
		);

		expect(refunds()).toHaveLength(0);
	});
});
