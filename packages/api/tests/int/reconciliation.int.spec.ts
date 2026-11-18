// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notifications = vi.hoisted(() => ({
	notifyPaymentSucceeded: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyOrderPaid: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyPaymentFailed: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyRefundInitiated: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyRefundCompleted: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyRefundFailed: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyRefundStaffAlert: vi.fn(async (_p: unknown, _n: unknown) => {}),
	notifyPayoutSent: vi.fn(async (_s: unknown, _n: unknown) => {}),
	notifyPayoutFailed: vi.fn(async (_s: unknown, _n: unknown) => {}),
	notifyPayoutHoldPlaced: vi.fn(async (_s: unknown, _n: unknown) => {}),
	notifyReconciliationAlert: vi.fn(async (_p: unknown, _n: unknown) => {}),
}));
vi.mock("../../src/services/paymentNotifications", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/paymentNotifications")
	>()),
	...notifications,
}));

const invoices = vi.hoisted(() => ({
	issueBuyerFeeInvoice: vi.fn(
		async (_req: unknown, _order: unknown, _intent: unknown) => {},
	),
	issueApplicationFeeCommissionInvoice: vi.fn(
		async (_req: unknown, _order: unknown) => {},
	),
}));
vi.mock("../../src/services/buyerFeeInvoices", () => invoices);

vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async () => {}),
	hasPushCredential: vi.fn(async () => false),
	syncNotificationSubscriber: vi.fn(async () => {}),
	buildExpoPushData: vi.fn(() => ({})),
}));
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: vi.fn(async () => ({ status: "sent" })),
}));

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

import type { LedgerCategory } from "../../src/collections/LedgerAccounts";
import { reconcileLedgerTask } from "../../src/jobs/reconcileLedger";
import { splitAmounts } from "../../src/lib/paymentMath";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
	type PaymentSettings,
	type ReleaseModel,
} from "../../src/lib/paymentSettings";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import { withTransaction } from "../../src/lib/transactions";
import type {
	LedgerAccount,
	LedgerTransaction,
	Order,
	PaymentIntent,
	Payout,
	ReconciliationMismatch,
	ReconciliationRun,
} from "../../src/payload-types";
import {
	accountBalance,
	ledgerAccountKey,
	postingFor,
	postLedger,
} from "../../src/services/ledger";
import { reconcilePendingPayments } from "../../src/services/paymentReconciliation";
import { applyStatus } from "../../src/services/payments";
import {
	applyTransferEvent,
	releaseCompletedOrder,
} from "../../src/services/payouts";
import {
	RECONCILIATION_WINDOW_DAYS,
	reconciliationWindow,
	runReconciliation,
} from "../../src/services/reconciliation";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const { GET } = await import(
	"../../src/app/(frontend)/api/staff/finance/reconciliation/route"
);

const NOW = new Date("2026-10-03T01:30:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (offsetMs: number) =>
	new Date(NOW.getTime() + offsetMs).toISOString();
const WINDOW = { from: new Date(NOW.getTime() - 3 * DAY), to: NOW };

const MARKET = DEFAULT_MARKETS[0];
const CURRENCY = MARKET.currency;
const SHOP = "s-1";
const ACCOUNT = "acct_1";
const BUYER = "u-buyer";
const OWNER = "u-owner";

/** The ledger spec's worked order: G 48 410, D 43 240. */
const SPLIT = splitAmounts({
	orderTotal: 47_000,
	commission: 3_153,
	vatRateBps: MARKET.vatRateBps,
	protection: PAYMENT_DEFAULTS.buyerProtection,
});
const G = SPLIT.buyerTotal;
const D = SPLIT.destinationAmount;

const settingsFor = (releaseModel: ReleaseModel): PaymentSettings => ({
	...PAYMENT_DEFAULTS,
	markets: [...DEFAULT_MARKETS],
	releaseModel,
});

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
		timestamps: { placedAt: at(-2 * HOUR) },
		contract: { locale: "fr" },
		confirmation: {},
		cancellation: {},
		handover: {},
		deliveryFailure: {},
		completionHold: "none",
		createdAt: at(-2 * HOUR),
		updatedAt: at(-2 * HOUR),
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
		providerReference: `pay-${id}`,
		idempotencyKey: `checkout:${BUYER}:${id}`,
		status: "pending",
		statusHistory: [
			{ status: "created", source: "system", at: at(-2 * HOUR) },
			{ status: "pending", source: "system", at: at(-2 * HOUR) },
		],
		attempt: 1,
		channel: "cm.mtn",
		payerPhone: "+237670000001",
		connectedAccount: "ca-1",
		destinationAmount: D,
		applicationFee: SPLIT.applicationFee,
		expiresAt: at(DAY),
		lateSuccess: false,
		createdAt: at(-2 * HOUR),
		updatedAt: at(-2 * HOUR),
		...overrides,
	};
}

let payload: FakePayload;
let fake: FakeMarketplaceProvider;

function world(seed: Record<string, Doc[]> = {}): FakePayload {
	payload = fakePayload(
		{
			users: [
				{ id: BUYER, role: "user" },
				{ id: OWNER, role: "user" },
				{ id: "u-admin", role: "admin" },
				{ id: "u-mod", role: "moderator" },
			],
			shops: [
				{ id: SHOP, name: "Akwa", owner: OWNER, status: "active", stats: {} },
			],
			"connected-accounts": [
				{
					id: "ca-1",
					shop: SHOP,
					provider: "notchpay",
					providerAccountId: ACCOUNT,
					accountType: "express",
					status: "active",
				},
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
			payouts: [],
			"payout-holds": [],
			"reconciliation-runs": [],
			"reconciliation-mismatches": [],
			"ledger-accounts": [],
			"ledger-transactions": [],
			...seed,
		},
		{
			uniques: {
				refunds: [["idempotencyKey"]],
				"ledger-accounts": [["key"]],
				"ledger-transactions": [["idempotencyKey"]],
				payouts: [["providerTransferId"]],
			},
		},
	);
	return payload;
}

/** The provider's clock sits inside the window. */
const marketplace = () =>
	new FakeMarketplaceProvider({
		now: () => new Date(NOW.getTime() - HOUR),
		accounts: [{ accountId: ACCOUNT }],
	});

const run = (releaseModel: ReleaseModel = "provider_hold") =>
	runReconciliation(payload, WINDOW, {
		provider: fake,
		now: NOW,
		settings: settingsFor(releaseModel),
	});

const mismatches = () =>
	payload.store[
		"reconciliation-mismatches"
	] as unknown as ReconciliationMismatch[];
const openRows = () => mismatches().filter((m) => m.status === "open");
const transactions = () =>
	payload.store["ledger-transactions"] as unknown as LedgerTransaction[];
const intent = (id: string) =>
	payload.store["payment-intents"].find(
		(row) => row.id === id,
	) as unknown as PaymentIntent;
const order = () => payload.store.orders[0] as unknown as Order;
const payouts = () => payload.store.payouts as unknown as Payout[];
const holds = () => payload.store["payout-holds"];
const balance = (category: LedgerCategory) =>
	accountBalance(payload, category, SHOP, CURRENCY);

/** The fields a mismatch row carries, without its id and timestamps. */
const shapeOf = (row: ReconciliationMismatch) => ({
	run: row.run,
	kind: row.kind,
	entityType: row.entityType,
	localId: row.localId,
	providerId: row.providerId,
	expected: row.expected,
	actual: row.actual,
	shop: row.shop,
	status: row.status,
});

/** A charge for o-1 as the webhook would have posted it: D pending for the shop. */
const postCharge = (orderId = "o-1", intentId = "pi-1") =>
	withTransaction(payload, (req) =>
		postLedger(req, {
			kind: "charge",
			occurredAt: at(-2 * HOUR),
			sourceType: "webhook-event",
			sourceId: intentId,
			currency: CURRENCY,
			order: orderId,
			shop: SHOP,
			paymentIntent: intentId,
			entries: postingFor("charge", SPLIT),
		}),
	);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	vi.clearAllMocks();
	world();
	fake = marketplace();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("a clean run", () => {
	it("matches a settled payment, the ledger and the shop's balance, and alerts nobody", async () => {
		fake.seedPayment({
			reference: "PI-pi-1",
			amount: G,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});
		await applyStatus(payload, "pi-1", {
			status: "succeeded",
			source: "webhook",
			at: NOW,
			amount: G,
			currency: CURRENCY,
		});
		fake.setBalance(ACCOUNT, { available: 0, pending: D });

		const result = await run();

		// 1 payment, 5 ledger accounts from the charge, 1 shop balance.
		expect(result.status).toBe("succeeded");
		expect(result.counts).toEqual({
			checked: 7,
			matched: 7,
			autoFixed: 0,
			mismatches: 0,
		});
		expect(result.window).toEqual({
			from: WINDOW.from.toISOString(),
			to: WINDOW.to.toISOString(),
		});
		expect(result.finishedAt).toBe(NOW.toISOString());
		expect(mismatches()).toEqual([]);
		expect(
			holds().filter((h) => h.reason === "reconciliation_mismatch"),
		).toEqual([]);
		expect(notifications.notifyReconciliationAlert).not.toHaveBeenCalled();
		expect(fake.callsTo("listTransactions")).toEqual([
			[{ from: WINDOW.from, to: WINDOW.to, page: 1 }],
			[{ from: WINDOW.from, to: WINDOW.to, page: 2 }],
			[{ from: WINDOW.from, to: WINDOW.to, page: 1, accountId: ACCOUNT }],
			[{ from: WINDOW.from, to: WINDOW.to, page: 2, accountId: ACCOUNT }],
		]);
	});

	it("covers the previous three days", () => {
		expect(RECONCILIATION_WINDOW_DAYS).toBe(3);
		expect(reconciliationWindow(NOW)).toEqual(WINDOW);
	});
});

describe("step 1: provider to local", () => {
	it("fetches a payment missing locally, settles it with source reconcile and records it auto_fixed", async () => {
		fake.seedPayment({
			reference: "PI-pi-1",
			amount: G,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});
		fake.setBalance(ACCOUNT, { available: 0, pending: D });

		const result = await run();

		expect(fake.callsTo("verifyPayment")).toEqual([["PI-pi-1"]]);
		expect(intent("pi-1").status).toBe("succeeded");
		expect(intent("pi-1").statusHistory?.at(-1)).toMatchObject({
			status: "succeeded",
			source: "reconcile",
		});
		expect([order().status, order().paymentStatus]).toEqual(["paid", "paid"]);
		const charges = transactions().filter((t) => t.kind === "charge");
		expect(
			charges.map((t) => [t.idempotencyKey, t.sourceType, t.order]),
		).toEqual([
			["reconciliation-run:pi-1:charge", "reconciliation-run", "o-1"],
		]);
		expect(mismatches().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "missing_locally",
				entityType: "payment-intent",
				localId: "pi-1",
				providerId: "pay_1",
				expected: { status: "succeeded", amount: G },
				actual: { status: "pending" },
				shop: SHOP,
				status: "auto_fixed",
			},
		]);
		expect(result.counts).toMatchObject({ autoFixed: 1, mismatches: 0 });
		expect(notifications.notifyReconciliationAlert).not.toHaveBeenCalled();
		expect(notifications.notifyOrderPaid).toHaveBeenCalledTimes(1);
	});

	it("records a listed payment the provider cannot fetch as missing_locally, open, and alerts staff", async () => {
		fake.addTransaction({
			entity: "payment",
			providerId: "pay_ghost",
			reference: "PI-pi-1",
			accountId: ACCOUNT,
			amount: G,
			currency: CURRENCY,
			fee: null,
			occurredAt: at(-HOUR),
			status: "succeeded",
		});

		const result = await run();

		expect(fake.callsTo("verifyPayment")).toEqual([["PI-pi-1"]]);
		expect(intent("pi-1").status).toBe("pending");
		expect(transactions()).toEqual([]);
		expect(mismatches().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "missing_locally",
				entityType: "payment-intent",
				localId: "pi-1",
				providerId: "pay_ghost",
				expected: { status: "succeeded" },
				actual: { status: "pending", fetched: false },
				shop: SHOP,
				status: "open",
			},
		]);
		expect(notifications.notifyReconciliationAlert.mock.calls).toEqual([
			[
				payload,
				{
					runId: result.id,
					openMismatches: 1,
					newMismatches: 1,
					byKind: { missing_locally: 1 },
				},
			],
		]);
	});

	it("records a provider payment no local intent knows as missing_locally, open", async () => {
		fake.addTransaction({
			entity: "payment",
			providerId: "pay_stray",
			reference: "PI-unknown",
			accountId: ACCOUNT,
			amount: 5_000,
			currency: CURRENCY,
			fee: null,
			occurredAt: at(-HOUR),
			status: "succeeded",
		});

		const result = await run();

		expect(openRows().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "missing_locally",
				entityType: "payment-intent",
				localId: undefined,
				providerId: "pay_stray",
				expected: null,
				actual: {
					reference: "PI-unknown",
					status: "succeeded",
					amount: 5_000,
					currency: CURRENCY,
				},
				shop: undefined,
				status: "open",
			},
		]);
	});
});

describe("step 2: local to provider", () => {
	it("records a succeeded local refund the provider does not know as missing_at_provider", async () => {
		world({
			refunds: [
				{
					id: "r-1",
					order: "o-1",
					shop: SHOP,
					paymentIntent: "pi-1",
					amount: 10_000,
					status: "succeeded",
					providerRefundId: "re_ghost",
					idempotencyKey: "order:o-1:1",
					sourceType: "order",
					sourceId: "o-1",
					updatedAt: at(-HOUR),
					createdAt: at(-DAY),
				},
			],
		});

		const result = await run();

		expect(fake.callsTo("getRefund")).toEqual([["re_ghost"]]);
		expect(mismatches().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "missing_at_provider",
				entityType: "refund",
				localId: "r-1",
				providerId: "re_ghost",
				expected: { status: "succeeded", amount: 10_000 },
				actual: null,
				shop: SHOP,
				status: "open",
			},
		]);
		expect(result.counts).toMatchObject({ mismatches: 1, autoFixed: 0 });
	});

	it("leaves a succeeded refund updated before the window alone", async () => {
		world({
			refunds: [
				{
					id: "r-1",
					shop: SHOP,
					amount: 10_000,
					status: "succeeded",
					providerRefundId: "re_ghost",
					updatedAt: at(-4 * DAY),
				},
			],
		});

		const result = await run();

		expect(fake.callsTo("getRefund")).toEqual([]);
		expect(mismatches()).toEqual([]);
		expect(result.counts?.checked).toBe(1);
	});
});

describe("amounts and statuses", () => {
	it("records a settled payment the provider reports for another amount as amount_mismatch", async () => {
		world({
			"payment-intents": [
				intentDoc("pi-1", { status: "succeeded", settledAmount: G }),
			],
		});
		fake.seedPayment({
			reference: "PI-pi-1",
			amount: G - 1_000,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});

		const result = await run();

		expect(mismatches().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "amount_mismatch",
				entityType: "payment-intent",
				localId: "pi-1",
				providerId: "pay-pi-1",
				expected: { amount: G, currency: CURRENCY },
				actual: { amount: G - 1_000, currency: CURRENCY },
				shop: SHOP,
				status: "open",
			},
		]);
	});

	it("lets settlement open its own amount_mismatch on a pending intent, and never doubles it", async () => {
		fake.seedPayment({
			reference: "PI-pi-1",
			amount: G - 1_000,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});

		const first = await run();
		const history = intent("pi-1").statusHistory?.length;
		const second = await run();

		expect(mismatches()).toHaveLength(1);
		// Task 14's row: no run, its own expected/actual shape.
		expect(shapeOf(mismatches()[0])).toEqual({
			run: undefined,
			kind: "amount_mismatch",
			entityType: "payment-intent",
			localId: "pi-1",
			providerId: "pay-pi-1",
			expected: { amount: G, currency: CURRENCY },
			actual: { amount: G - 1_000, currency: CURRENCY },
			shop: SHOP,
			status: "open",
		});
		expect(intent("pi-1").status).toBe("pending");
		expect(intent("pi-1").statusHistory).toHaveLength(history ?? -1);
		expect(transactions()).toEqual([]);
		expect(first.counts?.mismatches).toBe(1);
		expect(second.counts?.mismatches).toBe(1);
		expect(fake.callsTo("verifyPayment")).toEqual([["PI-pi-1"]]);
	});

	it("records a complete payout the provider reports failed as status_mismatch, and moves nothing", async () => {
		const { transferId } = await fake.releasePayout(ACCOUNT, {
			amount: 5_000,
			currency: CURRENCY,
			reference: "PO-p-1",
		});
		fake.script("PO-p-1", [{ entity: "transfer", status: "failed" }]);
		fake.advance("PO-p-1");
		world({
			payouts: [
				{
					id: "p-1",
					shop: SHOP,
					connectedAccount: "ca-1",
					amount: 5_000,
					currency: CURRENCY,
					orders: [],
					origin: "platform_release",
					status: "complete",
					statusHistory: [],
					providerTransferId: transferId,
					updatedAt: at(-HOUR),
				},
			],
		});

		const result = await run();

		expect(mismatches().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "status_mismatch",
				entityType: "payout",
				localId: "p-1",
				providerId: transferId,
				expected: { status: "complete" },
				actual: { status: "failed" },
				shop: SHOP,
				status: "open",
			},
		]);
		expect(payouts()[0].status).toBe("complete");
		expect(transactions()).toEqual([]);
	});
});

describe("step 3: balances", () => {
	it("opens balance_mismatch and a reconciliation_mismatch shop hold when the account is 1 XAF short", async () => {
		await postCharge();
		fake.setBalance(ACCOUNT, { available: 0, pending: D - 1 });

		const result = await run();

		expect(mismatches().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "balance_mismatch",
				entityType: "shop",
				localId: SHOP,
				providerId: ACCOUNT,
				expected: {
					amount: D,
					categories: ["seller_pending", "seller_releasable"],
					releaseModel: "provider_hold",
				},
				actual: { amount: D - 1, available: 0, pending: D - 1 },
				shop: SHOP,
				status: "open",
			},
		]);
		const mismatchId = mismatches()[0].id;
		expect(
			holds().map(
				({
					scope,
					shop,
					reason,
					status,
					blocksCharges,
					until,
					createdByType,
					note,
				}) => ({
					scope,
					shop,
					reason,
					status,
					blocksCharges,
					until,
					createdByType,
					note,
				}),
			),
		).toEqual([
			{
				scope: "shop",
				shop: SHOP,
				reason: "reconciliation_mismatch",
				status: "active",
				blocksCharges: false,
				until: null,
				createdByType: "system",
				note: `reconciliation mismatch ${mismatchId}`,
			},
		]);
	});

	it("opens nothing when the account holds exactly the shop's pending and releasable money", async () => {
		await postCharge();
		fake.setBalance(ACCOUNT, { available: 1_240, pending: D - 1_240 });

		const result = await run();

		expect(mismatches()).toEqual([]);
		expect(holds()).toEqual([]);
		expect(fake.callsTo("getConnectedAccountBalance")).toEqual([[ACCOUNT]]);
		expect(result.counts?.matched).toBe(result.counts?.checked);
	});

	it("under provider_schedule, nets a transfer the provider paid before completion against in-transit", async () => {
		world({
			orders: [
				orderDoc({
					status: "delivered",
					paymentStatus: "paid",
					settlement: {
						mode: "provider_split",
						releaseModel: "provider_schedule",
						connectedAccount: "ca-1",
						refundedAmount: 0,
					},
				}),
			],
		});
		await postCharge();
		// The provider's own weekly payout, before the order completes.
		const scheduled = {
			entity: "transfer" as const,
			providerEventId: "evt-sched",
			type: "transfer/complete",
			reference: "",
			amount: D,
			currency: CURRENCY,
			providerTransactionId: null,
			status: "complete" as const,
			transferId: "tr_sched",
			accountId: ACCOUNT,
			fee: null,
			failureReason: null,
		};
		await withTransaction(payload, (req) => applyTransferEvent(req, scheduled));
		fake.addTransaction({
			entity: "transfer",
			providerId: "tr_sched",
			reference: null,
			accountId: ACCOUNT,
			amount: D,
			currency: CURRENCY,
			fee: null,
			occurredAt: at(-HOUR),
			status: "complete",
		});
		fake.setBalance(ACCOUNT, { available: 0, pending: 0 });

		await run("provider_schedule");

		expect(await balance("seller_pending")).toBe(D);
		expect(await balance("seller_payout_in_transit")).toBe(-D);
		expect(mismatches()).toEqual([]);
		expect(holds()).toEqual([]);

		// The order completes: release moves pending into in-transit, both 0.
		payload.store.orders[0].status = "completed";
		payload.store["order-events"].push({
			id: "ev-completed",
			order: "o-1",
			type: "order.completed",
		});
		const released = await releaseCompletedOrder(
			payload,
			{ id: "o-1" },
			{ id: "ev-completed" },
		);
		expect(released).toMatchObject({ released: true, amount: D });

		const after = await run("provider_schedule");

		expect([
			await balance("seller_pending"),
			await balance("seller_payout_in_transit"),
		]).toEqual([0, 0]);
		expect(mismatches()).toEqual([]);
		expect(after.counts?.matched).toBe(after.counts?.checked);
	});
});

describe("step 4: ledger integrity", () => {
	it("corrects a corrupted cache as unbalanced_ledger and never touches the transaction", async () => {
		const { transaction } = await postCharge();
		fake.setBalance(ACCOUNT, { available: 0, pending: D });
		const pendingKey = ledgerAccountKey("seller_pending", SHOP, CURRENCY);
		const account = payload.store["ledger-accounts"].find(
			(a) => a.key === pendingKey,
		) as unknown as LedgerAccount;
		(account as unknown as Doc).balance = D + 500;
		const stored = transactions()[0];
		const before = structuredClone(stored);
		const writesBefore = payload.writes.length;
		vi.setSystemTime(NOW.getTime() + MIN);

		const result = await run();

		expect(await balance("seller_pending")).toBe(D);
		expect(mismatches().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "unbalanced_ledger",
				entityType: "ledger-account",
				localId: account.id,
				providerId: undefined,
				expected: { key: pendingKey, balance: D },
				actual: { key: pendingKey, balance: D + 500 },
				shop: SHOP,
				status: "open",
			},
		]);
		expect(transactions()).toHaveLength(1);
		expect(transactions()[0].id).toBe(transaction.id);
		expect(transactions()[0].updatedAt).toBe(before.updatedAt);
		expect(transactions()[0]).toEqual(before);
		expect(
			payload.writes
				.slice(writesBefore)
				.filter((w) => w.collection === "ledger-transactions"),
		).toEqual([]);
		// The cache was fixed before the balances were read: no balance_mismatch, no hold.
		expect(holds()).toEqual([]);
	});

	it("reports a posting whose sides differ and leaves it exactly as stored", async () => {
		world({
			"ledger-accounts": [
				{
					id: "la-pos",
					key: `provider_position:platform:${CURRENCY}`,
					category: "provider_position",
					type: "asset",
					currency: CURRENCY,
					balance: 100,
				},
				{
					id: "la-vat",
					key: `vat_payable:platform:${CURRENCY}`,
					category: "vat_payable",
					type: "liability",
					currency: CURRENCY,
					balance: 90,
				},
			],
			"ledger-transactions": [
				{
					id: "lt-bad",
					idempotencyKey: "webhook-event:x:charge",
					kind: "charge",
					sourceType: "webhook-event",
					sourceId: "x",
					entries: [
						{ account: "la-pos", debit: 100, credit: 0 },
						{ account: "la-vat", debit: 0, credit: 90 },
					],
					createdAt: at(-DAY),
					updatedAt: at(-DAY),
				},
			],
		});
		const before = structuredClone(payload.store["ledger-transactions"][0]);

		const result = await run();

		expect(mismatches().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "unbalanced_ledger",
				entityType: "ledger-transaction",
				localId: "lt-bad",
				providerId: undefined,
				expected: { debit: 100, credit: 100 },
				actual: { debit: 100, credit: 90 },
				shop: undefined,
				status: "open",
			},
		]);
		expect(payload.store["ledger-transactions"]).toEqual([before]);
	});
});

describe("Task 16's cancelled payout whose transfer the provider made anyway", () => {
	async function cancelledPayout(bound: string | null) {
		world({
			orders: [
				orderDoc({
					status: "completed",
					paymentStatus: "paid",
					settlement: {
						mode: "provider_split",
						releaseModel: "provider_hold",
						connectedAccount: "ca-1",
						refundedAmount: 0,
						releaseEligibleAt: at(-DAY),
						...(bound ? { payout: bound } : {}),
					},
				}),
			],
			payouts: [
				{
					id: "p-1",
					shop: SHOP,
					connectedAccount: "ca-1",
					payoutAccount: "pa-1",
					amount: D,
					currency: CURRENCY,
					orders: [{ order: "o-1", amount: D }],
					origin: "platform_release",
					status: "cancelled",
					statusHistory: [
						{ status: "scheduled", source: "system", at: at(-DAY) },
						{ status: "cancelled", source: "system", at: at(-DAY) },
					],
					failureReason: "releasePayout timed out",
					updatedAt: at(-DAY),
				},
			],
		});
		await postCharge();
		await withTransaction(payload, (req) =>
			postLedger(req, {
				kind: "release",
				occurredAt: at(-DAY),
				sourceType: "order-event",
				sourceId: "ev-completed",
				currency: CURRENCY,
				order: "o-1",
				shop: SHOP,
				entries: postingFor("release", {
					amount: D,
					releaseModel: "provider_hold",
				}),
			}),
		);
		// The timed-out call did reach the provider.
		return fake.releasePayout(ACCOUNT, {
			amount: D,
			currency: CURRENCY,
			reference: "PO-p-1",
		});
	}

	it("surfaces the transfer as missing_locally, mirrors it on a new payout and posts payout_submitted", async () => {
		const { transferId } = await cancelledPayout(null);

		const result = await run();

		const [cancelled, mirror] = payouts();
		expect(cancelled.status).toBe("cancelled");
		expect(cancelled.providerTransferId).toBeUndefined();
		expect({
			amount: mirror.amount,
			orders: mirror.orders?.map((l) => ({ order: l.order, amount: l.amount })),
			origin: mirror.origin,
			status: mirror.status,
			providerTransferId: mirror.providerTransferId,
			history: mirror.statusHistory?.map((h) => [h.status, h.source]),
		}).toEqual({
			amount: D,
			orders: [{ order: "o-1", amount: D }],
			origin: "platform_release",
			status: "pending",
			providerTransferId: transferId,
			history: [["pending", "reconcile"]],
		});
		expect(order().settlement?.payout).toBe(mirror.id);
		const submitted = transactions().filter(
			(t) => t.kind === "payout_submitted",
		);
		expect(submitted.map((t) => [t.idempotencyKey, t.payout])).toEqual([
			[`reconciliation-run:${mirror.id}:payout_submitted`, mirror.id],
		]);
		expect([
			await balance("seller_releasable"),
			await balance("seller_payout_in_transit"),
		]).toEqual([0, D]);
		expect(mismatches().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "missing_locally",
				entityType: "payout",
				localId: mirror.id,
				providerId: transferId,
				expected: { status: "pending", amount: D },
				actual: { status: "cancelled", payout: "p-1" },
				shop: SHOP,
				status: "auto_fixed",
			},
		]);

		await run();
		expect(payouts()).toHaveLength(2);
		expect(mismatches()).toHaveLength(1);
		expect(
			transactions().filter((t) => t.kind === "payout_submitted"),
		).toHaveLength(1);
	});

	it("leaves it open for staff when the orders were since paid by another payout", async () => {
		const { transferId } = await cancelledPayout("p-2");

		const result = await run();

		expect(payouts().map((p) => [p.id, p.status])).toEqual([
			["p-1", "cancelled"],
		]);
		expect(order().settlement?.payout).toBe("p-2");
		expect(transactions().filter((t) => t.kind === "payout_submitted")).toEqual(
			[],
		);
		expect(openRows().map(shapeOf)).toEqual([
			{
				run: result.id,
				kind: "missing_locally",
				entityType: "payout",
				localId: "p-1",
				providerId: transferId,
				expected: { status: "pending", amount: D },
				actual: { status: "cancelled", fetched: true },
				shop: SHOP,
				status: "open",
			},
			// The ledger still holds D releasable the provider no longer has.
			{
				run: result.id,
				kind: "balance_mismatch",
				entityType: "shop",
				localId: SHOP,
				providerId: ACCOUNT,
				expected: {
					amount: D,
					categories: ["seller_pending", "seller_releasable"],
					releaseModel: "provider_hold",
				},
				actual: { amount: 0, available: 0, pending: 0 },
				shop: SHOP,
				status: "open",
			},
		]);
	});
});

describe("idempotency of the whole run", () => {
	it("creates no new mismatch, hold or posting on a second run over the same window", async () => {
		world({
			"payment-intents": [
				intentDoc("pi-1"),
				intentDoc("pi-3", {
					targetId: "o-3",
					status: "succeeded",
					settledAmount: G,
					updatedAt: at(-HOUR),
				}),
			],
			refunds: [
				{
					id: "r-1",
					shop: SHOP,
					amount: 10_000,
					status: "succeeded",
					providerRefundId: "re_ghost",
					updatedAt: at(-HOUR),
				},
			],
			"ledger-accounts": [
				{
					id: "la-fee",
					key: `provider_fee_expense:platform:${CURRENCY}`,
					category: "provider_fee_expense",
					type: "expense",
					currency: CURRENCY,
					balance: 300,
				},
			],
		});
		fake.seedPayment({
			reference: "PI-pi-1",
			amount: G,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});
		fake.seedPayment({
			reference: "PI-pi-3",
			amount: G - 1_000,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});
		fake.addTransaction({
			entity: "payment",
			providerId: "pay_stray",
			reference: "PI-unknown",
			accountId: ACCOUNT,
			amount: 5_000,
			currency: CURRENCY,
			fee: null,
			occurredAt: at(-HOUR),
			status: "succeeded",
		});
		const { transferId } = await fake.releasePayout(ACCOUNT, {
			amount: 5_000,
			currency: CURRENCY,
			reference: "PO-p-1",
		});
		fake.script("PO-p-1", [{ entity: "transfer", status: "failed" }]);
		fake.advance("PO-p-1");
		payload.store.payouts.push({
			id: "p-1",
			shop: SHOP,
			connectedAccount: "ca-1",
			amount: 5_000,
			currency: CURRENCY,
			orders: [],
			origin: "platform_release",
			status: "complete",
			statusHistory: [],
			providerTransferId: transferId,
			updatedAt: at(-HOUR),
		});
		fake.setBalance(ACCOUNT, { available: 0, pending: D - 1 });

		const first = await run();
		const rows = structuredClone(mismatches());
		const postings = transactions().length;
		const histories = payload.store["payment-intents"].map(
			(i) => (i.statusHistory as unknown[]).length,
		);

		const second = await run();

		expect(rows.map((r) => [r.kind, r.status]).sort()).toEqual(
			[
				["amount_mismatch", "open"],
				["balance_mismatch", "open"],
				["missing_at_provider", "open"],
				["missing_locally", "auto_fixed"],
				["missing_locally", "open"],
				["status_mismatch", "open"],
				["unbalanced_ledger", "open"],
			].sort(),
		);
		expect(mismatches()).toEqual(rows);
		expect(holds()).toHaveLength(1);
		expect(transactions()).toHaveLength(postings);
		expect(
			payload.store["payment-intents"].map(
				(i) => (i.statusHistory as unknown[]).length,
			),
		).toEqual(histories);
		expect(first.counts).toMatchObject({ autoFixed: 1, mismatches: 6 });
		// The cache drift was corrected by the first run: five findings remain.
		expect(second.counts).toMatchObject({ autoFixed: 0, mismatches: 5 });
		expect(
			notifications.notifyReconciliationAlert.mock.calls.map(
				([, notice]) => notice,
			),
		).toEqual([
			{
				runId: first.id,
				openMismatches: 6,
				newMismatches: 6,
				byKind: {
					missing_locally: 1,
					missing_at_provider: 1,
					amount_mismatch: 1,
					status_mismatch: 1,
					balance_mismatch: 1,
					unbalanced_ledger: 1,
				},
			},
			{
				runId: second.id,
				openMismatches: 6,
				newMismatches: 0,
				byKind: {
					missing_locally: 1,
					missing_at_provider: 1,
					amount_mismatch: 1,
					status_mismatch: 1,
					balance_mismatch: 1,
					unbalanced_ledger: 1,
				},
			},
		]);
	});
});

describe("a failed run", () => {
	it("records the run as failed with the provider's error and rethrows", async () => {
		fake.failWhen("listTransactions");

		await expect(run()).rejects.toThrow();

		const [failed] = payload.store[
			"reconciliation-runs"
		] as unknown as ReconciliationRun[];
		expect(failed.status).toBe("failed");
		expect(failed.error).toMatch(/listTransactions/);
		expect(failed.finishedAt).toBe(NOW.toISOString());
	});
});

describe("the reconcileLedger job", () => {
	it("is exported for the jobs wiring, which owns its schedule", () => {
		expect(reconcileLedgerTask.slug).toBe("reconcileLedger");
		expect(reconcileLedgerTask.schedule).toBeUndefined();
	});
});

describe("GET /api/staff/finance/reconciliation", () => {
	const asUser = (user: Doc | null) => {
		payload.auth.mockResolvedValue({ user });
		getPayloadMock.mockResolvedValue(payload);
	};
	const get = (query = "") =>
		GET(
			new Request(`http://localhost/api/staff/finance/reconciliation${query}`),
		);

	it("shows an admin the named run and its mismatches", async () => {
		fake.addTransaction({
			entity: "payment",
			providerId: "pay_ghost",
			reference: "PI-pi-1",
			accountId: ACCOUNT,
			amount: G,
			currency: CURRENCY,
			fee: null,
			occurredAt: at(-HOUR),
			status: "succeeded",
		});
		const result = await run();
		asUser({ id: "u-admin", role: "admin" });

		const response = await get(`?run=${result.id}`);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.run.id).toBe(result.id);
		expect(body.run.counts).toEqual(result.counts);
		expect(
			body.mismatches.map((m: ReconciliationMismatch) => [m.kind, m.localId]),
		).toEqual([["missing_locally", "pi-1"]]);
	});

	it("answers the latest run when none is named", async () => {
		await run();
		const latest = await run();
		asUser({ id: "u-admin", role: "admin" });

		const body = await (await get()).json();

		expect(body.run.id).toBe(latest.id);
		expect(body.mismatches).toEqual([]);
	});

	it("refuses a moderator (403), an anonymous caller (401), a malformed id (400) and an unknown run (404)", async () => {
		await run();
		asUser({ id: "u-mod", role: "moderator" });
		const moderator = await get();
		asUser(null);
		const anonymous = await get();
		asUser({ id: "u-admin", role: "admin" });
		const malformed = await get("?run=../x");
		const unknown = await get("?run=nope");

		expect(
			await Promise.all(
				[moderator, anonymous, malformed, unknown].map(async (r) => [
					r.status,
					(await r.json()).code,
				]),
			),
		).toEqual([
			[403, "generic.forbidden"],
			[401, "generic.unauthorized"],
			[400, "generic.validation"],
			[404, "generic.notFound"],
		]);
	});
});

describe("reconcilePendingPayments, P5 coverage", () => {
	const poll = (now = NOW) =>
		reconcilePendingPayments(payload, {
			now,
			marketplace: fake,
			getProvider: () => {
				throw new Error("P0's provider is not for checkout intents");
			},
		});

	it("settles a checkout intent pending more than 2 minutes through the marketplace, and leaves a younger one", async () => {
		world({
			"payment-intents": [
				intentDoc("pi-1", { createdAt: at(-3 * MIN) }),
				intentDoc("pi-2", { targetId: "o-2", createdAt: at(-1 * MIN) }),
			],
		});
		fake.seedPayment({
			reference: "PI-pi-1",
			amount: G,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});

		const stats = await poll();

		expect(stats).toEqual({
			checked: 1,
			settled: 1,
			expired: 0,
			errors: 0,
			refundsApplied: 0,
			payoutsApplied: 0,
		});
		expect(fake.callsTo("verifyPayment")).toEqual([["PI-pi-1"]]);
		expect(intent("pi-1").statusHistory?.at(-1)).toMatchObject({
			status: "succeeded",
			source: "reconcile",
		});
		expect(intent("pi-2").status).toBe("pending");
	});

	it("applies a refund and a payout silent for more than 24 hours, and leaves younger ones", async () => {
		fake.seedPayment({
			reference: "PI-pi-1",
			amount: G,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});
		await applyStatus(payload, "pi-1", {
			status: "succeeded",
			source: "webhook",
			at: NOW,
			amount: G,
			currency: CURRENCY,
		});
		const { refundId } = await fake.createRefund({
			paymentReference: "PI-pi-1",
			amount: 10_000,
			reason: "withdrawal",
			idempotencyKey: "order:o-1:1",
		});
		fake.script("order:o-1:1", [{ entity: "refund", status: "succeeded" }]);
		fake.advance("order:o-1:1");
		const { transferId } = await fake.releasePayout(ACCOUNT, {
			amount: 5_000,
			currency: CURRENCY,
			reference: "PO-p-1",
		});
		fake.script("PO-p-1", [{ entity: "transfer", status: "complete" }]);
		fake.advance("PO-p-1");
		const refundRow = (id: string, updatedAt: string) => ({
			id,
			order: "o-1",
			shop: SHOP,
			buyer: BUYER,
			paymentIntent: "pi-1",
			amount: 10_000,
			breakdown: {
				seller: 9_000,
				commission: 840,
				commissionVat: 160,
				buyerProtectionFee: 0,
			},
			reason: "withdrawal",
			sourceType: "order",
			sourceId: "o-1",
			status: "pending",
			statusHistory: [{ status: "pending", source: "system", at: updatedAt }],
			updatedAt,
		});
		payload.store.refunds.push(
			{
				...refundRow("r-1", at(-25 * HOUR)),
				idempotencyKey: "order:o-1:1",
				providerRefundId: refundId,
			},
			{
				...refundRow("r-2", at(-23 * HOUR)),
				idempotencyKey: "order:o-1:2",
				providerRefundId: "re_young",
			},
		);
		payload.store.payouts.push({
			id: "p-1",
			shop: SHOP,
			connectedAccount: "ca-1",
			amount: 5_000,
			currency: CURRENCY,
			orders: [],
			origin: "platform_release",
			status: "pending",
			statusHistory: [
				{ status: "pending", source: "system", at: at(-25 * HOUR) },
			],
			providerTransferId: transferId,
			updatedAt: at(-25 * HOUR),
		});

		const stats = await poll();

		expect(stats).toMatchObject({
			refundsApplied: 1,
			payoutsApplied: 1,
			errors: 0,
		});
		expect(fake.callsTo("getRefund")).toEqual([[refundId]]);
		expect(fake.callsTo("getTransfer")).toEqual([[transferId]]);
		expect(payload.store.refunds.map((r) => [r.id, r.status])).toEqual([
			["r-1", "succeeded"],
			["r-2", "pending"],
		]);
		expect(payouts()[0].status).toBe("complete");
		expect(
			transactions()
				.filter((t) => ["refund_complete", "payout_complete"].includes(t.kind))
				.map((t) => [t.kind, t.sourceType]),
		).toEqual([
			["refund_complete", "reconciliation-run"],
			["payout_complete", "reconciliation-run"],
		]);
	});
});
