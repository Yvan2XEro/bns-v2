// @vitest-environment node
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const getPayloadMock = vi.hoisted(() => vi.fn());
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => {
	const actual = await importOriginal<typeof import("payload")>();
	return { ...actual, getPayload: getPayloadMock };
});

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
	notifyConnectedAccountLost: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock("../../src/services/paymentNotifications", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/paymentNotifications")
	>()),
	...notifications,
}));
vi.mock("../../src/services/buyerFeeInvoices", () => ({
	issueBuyerFeeInvoice: vi.fn(async () => {}),
	issueApplicationFeeCommissionInvoice: vi.fn(async () => {}),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async () => {}),
	hasPushCredential: vi.fn(async () => false),
	syncNotificationSubscriber: vi.fn(async () => {}),
	buildExpoPushData: vi.fn(() => ({})),
}));
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: vi.fn(async () => ({ status: "sent" })),
}));

import { splitAmounts } from "../../src/lib/paymentMath";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
} from "../../src/lib/paymentSettings";
import type {
	EmitInput,
	FakeMarketplaceProvider,
	SignedEvent,
} from "../../src/lib/payments/fakeMarketplace";
import { sharedFakeMarketplace } from "../../src/lib/payments/marketplaceRegistry";
import { withTransaction } from "../../src/lib/transactions";
import type {
	LedgerTransaction,
	Order,
	OrderEvent,
	PaymentIntent,
	Payout,
	PayoutHold,
	Refund,
	WebhookEvent,
} from "../../src/payload-types";
import { registerCheckoutSettlementHandlers } from "../../src/services/checkoutSettlement";
import { registerFraudTriggers } from "../../src/services/fraudTriggers";
import {
	__resetOrderEventHandlers,
	runOrderEventHandlers,
} from "../../src/services/orders/events";
import { registerPayoutHandlers } from "../../src/services/payouts";
import {
	registerRefundSubmissionQueue,
	requestRefund,
} from "../../src/services/refunds";
import { processWebhookEvent } from "../../src/services/webhookEvents";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

type Handler = (request: Request) => Promise<Response>;
let paymentsPOST: Handler;
let boostPOST: Handler;
let callbackGET: Handler;

beforeAll(async () => {
	({ POST: paymentsPOST } = await import(
		"../../src/app/(frontend)/api/public/payments/webhook/notchpay/route"
	));
	({ POST: boostPOST } = await import(
		"../../src/app/(frontend)/api/public/boost/webhook/notchpay/route"
	));
	({ GET: callbackGET } = await import(
		"../../src/app/(frontend)/api/public/payments/notchpay/callback/route"
	));
}, 60_000);

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const MARKET = DEFAULT_MARKETS[0];
const CURRENCY = MARKET.currency;
const SHOP = "s-1";
const BUYER = "u-buyer";
const OWNER = "u-owner";
const ACCOUNT = "acct_t17";

const split = (orderTotal: number, commission: number) =>
	splitAmounts({
		orderTotal,
		commission,
		vatRateBps: MARKET.vatRateBps,
		protection: PAYMENT_DEFAULTS.buyerProtection,
	});
type Split = ReturnType<typeof split>;

/** The ledger spec's worked order: G 48 410. */
const WORKED = split(47_000, 3_153);
const G = WORKED.buyerTotal;

function orderDoc(id: string, s: Split, overrides: Doc = {}): Doc {
	return {
		id,
		orderNumber: `BNS-${id}`,
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
			subtotal: s.buyerTotal - s.buyerProtectionFee - 2_000,
			deliveryFee: 2_000,
			discount: 0,
			total: s.buyerTotal,
			currency: CURRENCY,
			buyerProtectionFee: s.buyerProtectionFee,
			buyerProtectionFeeVat: s.buyerProtectionFeeVat,
			commission: s.commission,
			commissionVat: s.commissionVat,
			applicationFee: s.applicationFee,
			destinationAmount: s.destinationAmount,
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

function intentDoc(id: string, s: Split, overrides: Doc = {}): Doc {
	return {
		id,
		purpose: "checkout",
		targetType: "order",
		targetId: "o-1",
		customer: BUYER,
		amount: s.buyerTotal,
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
		destinationAmount: s.destinationAmount,
		applicationFee: s.applicationFee,
		expiresAt: at(20 * MIN),
		lateSuccess: false,
		createdAt: at(-9 * MIN),
		updatedAt: at(-9 * MIN),
		...overrides,
	};
}

/** Paid protected orders of the shop, older than o-1: they rank it past the first-3 rule. */
function priorOrders(count: number, overrides: Doc = {}): Doc[] {
	return Array.from({ length: count }, (_, i) =>
		orderDoc(`o-prior-${i + 1}`, WORKED, {
			status: "accepted",
			paymentStatus: "paid",
			createdAt: at(-(i + 2) * DAY),
			...overrides,
		}),
	);
}

let payload: FakePayload;
let fake: FakeMarketplaceProvider;
const logSpies: Array<ReturnType<typeof vi.spyOn>> = [];
let unregisterQueue: () => void = () => {};

function world(
	options: { order?: Split; extra?: Record<string, Doc[]> } = {},
): FakePayload {
	const s = options.order ?? WORKED;
	const extra = options.extra ?? {};
	payload = fakePayload(
		{
			users: [
				{ id: BUYER, role: "user" },
				{ id: OWNER, role: "user" },
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
					chargesEnabled: true,
					payoutsEnabled: true,
					requirementsDue: [],
					payoutSchedule: "manual",
				},
			],
			orders: [orderDoc("o-1", s), ...(extra.orders ?? [])],
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
			"order-events": [],
			"payment-intents": [intentDoc("pi-1", s)],
			refunds: extra.refunds ?? [],
			payouts: extra.payouts ?? [],
			"payout-holds": [],
			"reconciliation-mismatches": [],
			"webhook-events": [],
			listings: extra.listings ?? [],
			"boost-payments": extra["boost-payments"] ?? [],
		},
		{
			uniques: {
				"webhook-events": [["provider", "providerEventId"]],
				refunds: [["idempotencyKey"]],
				"ledger-accounts": [["key"]],
				"ledger-transactions": [["idempotencyKey"]],
				payouts: [["providerTransferId"]],
			},
		},
	);
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

beforeEach(() => {
	fake = sharedFakeMarketplace();
	fake.seedAccount({ accountId: ACCOUNT });
	__resetOrderEventHandlers();
	registerCheckoutSettlementHandlers();
	registerPayoutHandlers();
	registerFraudTriggers();
	unregisterQueue = registerRefundSubmissionQueue(async () => {});
	for (const method of ["log", "info", "warn", "error"] as const) {
		logSpies.push(
			vi.spyOn(console, method).mockImplementation(() => undefined),
		);
	}
	for (const fn of Object.values(notifications)) fn.mockClear();
	world();
});

afterEach(() => {
	unregisterQueue();
	vi.unstubAllEnvs();
	for (const spy of logSpies.splice(0)) spy.mockRestore();
});

// ─── helpers ────────────────────────────────────────────────────────────────

let eventSeq = 0;
/** Every emitted event gets an id unique across the run: the fake is shared. */
const emit = (input: EmitInput): SignedEvent =>
	fake.emit({ providerEventId: `evt-t17-${++eventSeq}`, ...input });

const paymentSucceeded = (overrides: Partial<EmitInput> = {}) =>
	emit({
		entity: "payment",
		reference: "PI-pi-1",
		status: "succeeded",
		amount: G,
		currency: CURRENCY,
		providerTransactionId: "np-pi-1",
		accountId: ACCOUNT,
		fee: null,
		failureCode: null,
		...overrides,
	} as EmitInput);

const deliver = (signed: SignedEvent, handler: Handler = paymentsPOST) =>
	handler(
		new Request("http://localhost/api/public/payments/webhook/notchpay", {
			method: "POST",
			headers: signed.headers,
			body: signed.rawBody,
		}),
	);

const rows = () => payload.store["webhook-events"] as unknown as WebhookEvent[];

/** Runs `processWebhookEvent` for every stored row not yet processed, in arrival order. */
async function drain(): Promise<string[]> {
	const outcomes: string[] = [];
	for (const row of rows().filter((r) => !r.processedAt)) {
		outcomes.push((await processWebhookEvent(payload, String(row.id))).outcome);
	}
	return outcomes;
}

async function deliverAll(events: SignedEvent[]): Promise<string[]> {
	const outcomes: string[] = [];
	for (const event of events) {
		expect((await deliver(event)).status).toBe(200);
		outcomes.push(...(await drain()));
	}
	return outcomes;
}

const order = (id = "o-1") =>
	payload.store.orders.find((o) => o.id === id) as unknown as Order;
const intent = (id = "pi-1") =>
	payload.store["payment-intents"].find(
		(i) => i.id === id,
	) as unknown as PaymentIntent;
const transactions = () =>
	(payload.store["ledger-transactions"] ??
		[]) as unknown as LedgerTransaction[];
const ofKind = (kind: string) => transactions().filter((t) => t.kind === kind);
const refunds = () => payload.store.refunds as unknown as Refund[];
const payouts = () => payload.store.payouts as unknown as Payout[];
const holds = () => payload.store["payout-holds"] as unknown as PayoutHold[];
const paidNotes = () =>
	(payload.store["order-events"] as unknown as OrderEvent[]).filter(
		(e) => e.reason === "payment_succeeded",
	);

function everythingLogged(): string {
	return JSON.stringify([
		...logSpies.flatMap((spy) => spy.mock.calls),
		payload.logger.info.mock.calls,
		payload.logger.warn.mock.calls,
		payload.logger.error.mock.calls,
	]);
}

async function payTheOrder(): Promise<void> {
	expect(await deliverAll([paymentSucceeded()])).toEqual(["applied"]);
	expect(order().paymentStatus).toBe("paid");
}

async function orderRefund(amount?: number): Promise<Refund> {
	return withTransaction(payload, (req) =>
		requestRefund(req, {
			order: "o-1",
			amount,
			reason: "order_cancelled",
			sourceType: "order",
			sourceId: "o-1",
		}),
	);
}

const refundEvent = (
	refund: Refund,
	status: "pending" | "processing" | "succeeded" | "failed",
	overrides: Partial<EmitInput> = {},
) =>
	emit({
		entity: "refund",
		reference: refund.idempotencyKey,
		status,
		refundId: "re_t17",
		paymentReference: "PI-pi-1",
		amount: refund.amount,
		currency: CURRENCY,
		providerTransactionId: null,
		accountId: ACCOUNT,
		fee: null,
		...overrides,
	} as EmitInput);

const transferEvent = (
	status: "pending" | "complete" | "failed",
	overrides: Partial<EmitInput> = {},
) =>
	emit({
		entity: "transfer",
		reference: "PO-po-1",
		status,
		transferId: "tr_t17",
		accountId: ACCOUNT,
		amount: 18_400,
		currency: CURRENCY,
		providerTransactionId: null,
		fee: null,
		failureReason: null,
		...overrides,
	} as EmitInput);

const scheduledPayout = (): Doc => ({
	id: "po-1",
	shop: SHOP,
	connectedAccount: "ca-1",
	amount: 18_400,
	currency: CURRENCY,
	orders: [],
	origin: "platform_release",
	status: "scheduled",
	statusHistory: [{ status: "scheduled", source: "system", at: at(-HOUR) }],
});

// ─── the route ─────────────────────────────────────────────────────────────

describe("POST /api/public/payments/webhook/notchpay", () => {
	it("stores a signed event under the fake's id, answers 200 and queues it", async () => {
		const signed = paymentSucceeded();
		const response = await deliver(signed);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });
		expect(rows()).toHaveLength(1);
		expect(rows()[0]).toMatchObject({
			provider: "fake",
			providerEventId: signed.event.providerEventId,
			type: "payment/succeeded",
			reference: "PI-pi-1",
			providerReference: "np-pi-1",
			attempts: 0,
			raw: JSON.parse(signed.rawBody),
		});
		expect(payload.jobs.queue).toHaveBeenCalledTimes(1);
		expect(payload.jobs.queue).toHaveBeenCalledWith({
			task: "processWebhookEvent",
			input: { eventId: rows()[0].id },
			queue: "payments",
		});
	});

	it("rejects a bad signature with 400, stores nothing and never logs the signature", async () => {
		const signed = paymentSucceeded();
		const good = signed.headers["x-fake-signature"];
		const forged = `${good.slice(0, -1)}${good.endsWith("0") ? "1" : "0"}`;

		const response = await deliver({
			...signed,
			headers: { "x-fake-signature": forged },
		});

		expect(response.status).toBe(400);
		expect(rows()).toHaveLength(0);
		expect(payload.jobs.queue).toHaveBeenCalledTimes(0);
		// The path ran: the rejection itself was logged, without the value.
		expect(console.warn).toHaveBeenCalledWith(
			"[webhook:marketplace] signature verification failed",
		);
		const logged = everythingLogged();
		expect(logged).not.toContain(forged);
		expect(logged).not.toContain(good);
	});

	it("the same event id twice: one row, one queued job, one effect", async () => {
		const signed = paymentSucceeded();

		const first = await deliver(signed);
		const second = await deliver(signed);

		expect(first.status).toBe(200);
		expect(await second.json()).toEqual({ received: true, duplicate: true });
		expect(rows()).toHaveLength(1);
		expect(payload.jobs.queue).toHaveBeenCalledTimes(1);
		expect(await drain()).toEqual(["applied"]);
		expect(await processWebhookEvent(payload, String(rows()[0].id))).toEqual({
			outcome: "already_processed",
		});
		expect(ofKind("charge")).toHaveLength(1);
		expect(paidNotes()).toHaveLength(1);
		expect(notifications.notifyPaymentSucceeded).toHaveBeenCalledTimes(1);
	});

	it("the same state change under two event ids: the second is ignored, the posting kept once", async () => {
		const outcomes = await deliverAll([paymentSucceeded(), paymentSucceeded()]);

		expect(rows()).toHaveLength(2);
		expect(outcomes).toEqual(["applied", "unchanged"]);
		expect(intent().statusHistory?.map((h) => h.status)).toEqual([
			"created",
			"pending",
			"succeeded",
		]);
		expect(ofKind("charge")).toHaveLength(1);
		expect(ofKind("charge")[0].idempotencyKey).toBe(
			"webhook-event:pi-1:charge",
		);
		expect(paidNotes()).toHaveLength(1);
	});

	it("the P0 boost URL feeds the same spine and still settles a boost payment", async () => {
		world({
			extra: {
				listings: [{ id: "l-1", status: "published", boostedUntil: null }],
				"boost-payments": [
					{
						id: "bp-1",
						listing: "l-1",
						duration: "7",
						status: "pending",
						amount: 900,
					},
				],
			},
		});
		payload.store["payment-intents"].push({
			id: "pi-b",
			purpose: "boost",
			targetId: "bp-1",
			amount: 900,
			currency: CURRENCY,
			status: "pending",
			reference: "PI-pi-b",
			providerReference: "np-pi-b",
			customer: BUYER,
			statusHistory: [],
		});

		const response = await deliver(
			paymentSucceeded({
				reference: "PI-pi-b",
				providerTransactionId: "np-pi-b",
				amount: 900,
			}),
			boostPOST,
		);

		expect(response.status).toBe(200);
		expect(rows()[0].provider).toBe("fake");
		expect(await drain()).toEqual(["applied"]);
		expect(intent("pi-b").status).toBe("succeeded");
		expect(payload.store["boost-payments"][0].status).toBe("completed");
		expect(payload.store.listings[0].boostedUntil).toEqual(expect.any(String));
		// The checkout order was not touched by a boost event.
		expect(order().paymentStatus).toBe("awaiting_payment");
	});
});

// ─── the dispatch, one entity at a time ─────────────────────────────────────

describe("processWebhookEvent entity dispatch", () => {
	it("payment → settlement: the order is paid and the charge posted", async () => {
		await payTheOrder();

		expect(order().status).toBe("paid");
		expect(ofKind("charge")).toHaveLength(1);
		expect(rows()[0].processedAt).toEqual(expect.any(String));
	});

	it("refund → the refund lifecycle", async () => {
		await payTheOrder();
		const refund = await orderRefund();

		expect(await deliverAll([refundEvent(refund, "pending")])).toEqual([
			"applied",
		]);
		expect(refunds()[0]).toMatchObject({
			status: "pending",
			providerRefundId: "re_t17",
		});
		expect(ofKind("refund_submitted")).toHaveLength(1);
	});

	it("transfer → the payout lifecycle", async () => {
		world({ extra: { payouts: [scheduledPayout()] } });

		expect(await deliverAll([transferEvent("complete")])).toEqual(["applied"]);
		expect(payouts()[0].status).toBe("complete");
		expect(ofKind("payout_submitted")).toHaveLength(1);
		expect(ofKind("payout_complete")).toHaveLength(1);
	});

	it("an RP- transfer is P8's: logged and skipped, nothing written", async () => {
		const outcomes = await deliverAll([
			transferEvent("complete", { reference: "RP-77", transferId: "tr_rp" }),
		]);

		expect(outcomes).toEqual(["skipped_reseller"]);
		expect(payouts()).toHaveLength(0);
		expect(transactions()).toHaveLength(0);
		expect(payload.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ reference: "RP-77", transferId: "tr_rp" }),
			"[webhooks] reseller payout transfer skipped until P8",
		);
		expect(rows()[0].processedAt).toEqual(expect.any(String));
	});

	it("account → the connected account row, with the lost-account hold", async () => {
		const outcomes = await deliverAll([
			emit({
				entity: "account",
				status: "deauthorized",
				accountId: ACCOUNT,
				reference: "",
				amount: null,
				currency: null,
				providerTransactionId: null,
			}),
		]);

		expect(outcomes).toEqual(["applied"]);
		expect(payload.store["connected-accounts"][0]).toMatchObject({
			status: "deauthorized",
			chargesEnabled: false,
			payoutsEnabled: false,
		});
		expect(
			holds().map((h) => ({
				scope: h.scope,
				shop: h.shop,
				reason: h.reason,
				blocksCharges: h.blocksCharges,
				status: h.status,
			})),
		).toEqual([
			{
				scope: "shop",
				shop: SHOP,
				reason: "fraud_signal",
				blocksCharges: true,
				status: "active",
			},
		]);
	});

	it("debit → the clawback posting", async () => {
		await payTheOrder();

		const outcomes = await deliverAll([
			emit({
				entity: "debit",
				status: "succeeded",
				debitId: "dbt_t17",
				accountId: ACCOUNT,
				reference: "CB-o-1",
				amount: 1_000,
				currency: CURRENCY,
				providerTransactionId: null,
			}),
		]);

		expect(outcomes).toEqual(["posted"]);
		expect(ofKind("clawback_recovered")).toHaveLength(1);
		expect(ofKind("clawback_recovered")[0].sourceId).toBe("dbt_t17");
	});
});

// ─── Review Focus 2: out of order ───────────────────────────────────────────

describe("out-of-order delivery: one state, one posting", () => {
	it("transfer.complete before transfer.created", async () => {
		world({ extra: { payouts: [scheduledPayout()] } });
		const created = transferEvent("pending");
		const complete = transferEvent("complete");

		const outcomes = await deliverAll([complete, created]);

		expect(outcomes).toEqual(["applied", "unchanged"]);
		expect(payouts()).toHaveLength(1);
		expect(payouts()[0].status).toBe("complete");
		expect(payouts()[0].statusHistory?.map((h) => h.status)).toEqual([
			"scheduled",
			"pending",
			"complete",
		]);
		expect(ofKind("payout_submitted")).toHaveLength(1);
		expect(ofKind("payout_complete")).toHaveLength(1);
		expect(notifications.notifyPayoutSent).toHaveBeenCalledTimes(1);
	});

	it("refund.complete before refund.created", async () => {
		await payTheOrder();
		const refund = await orderRefund();
		expect(refund.status).toBe("created");

		const outcomes = await deliverAll([
			refundEvent(refund, "succeeded"),
			refundEvent(refund, "pending"),
		]);

		expect(outcomes).toEqual(["applied", "stale"]);
		expect(refunds()).toHaveLength(1);
		expect(refunds()[0].status).toBe("succeeded");
		expect(refunds()[0].statusHistory?.map((h) => h.status)).toEqual([
			"created",
			"pending",
			"succeeded",
		]);
		expect(ofKind("refund_submitted")).toHaveLength(1);
		expect(ofKind("refund_complete")).toHaveLength(1);
		expect(order().paymentStatus).toBe("refunded");
		expect(notifications.notifyRefundCompleted).toHaveBeenCalledTimes(1);
	});

	it("payment.succeeded after the callback already settled", async () => {
		fake.seedPayment({
			reference: "PI-pi-1",
			amount: G,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});

		const redirect = await callbackGET(
			new Request(
				"http://localhost/api/public/payments/notchpay/callback?orderId=o-1",
			),
		);
		expect(redirect.status).toBe(302);
		expect(order().paymentStatus).toBe("paid");

		expect(await deliverAll([paymentSucceeded()])).toEqual(["unchanged"]);
		expect(intent().status).toBe("succeeded");
		expect(intent().statusHistory?.map((h) => [h.status, h.source])).toEqual([
			["created", "system"],
			["pending", "system"],
			["succeeded", "callback"],
		]);
		expect(ofKind("charge")).toHaveLength(1);
		expect(paidNotes()).toHaveLength(1);
		expect(notifications.notifyOrderPaid).toHaveBeenCalledTimes(1);
	});

	it("the same refund state under two event ids posts once", async () => {
		await payTheOrder();
		const refund = await orderRefund();

		const outcomes = await deliverAll([
			refundEvent(refund, "succeeded"),
			refundEvent(refund, "succeeded"),
		]);

		expect(outcomes).toEqual(["applied", "unchanged"]);
		expect(ofKind("refund_submitted")).toHaveLength(1);
		expect(ofKind("refund_complete")).toHaveLength(1);
	});
});

// ─── the callback ───────────────────────────────────────────────────────────

describe("GET /api/public/payments/notchpay/callback", () => {
	const callback = (query: string) =>
		callbackGET(
			new Request(
				`http://localhost/api/public/payments/notchpay/callback?${query}`,
			),
		);

	beforeEach(() => {
		vi.stubEnv("PUBLIC_WEB_URL", "https://web.test");
		fake.seedPayment({
			reference: "PI-pi-1",
			amount: G,
			currency: CURRENCY,
			status: "succeeded",
			accountId: ACCOUNT,
		});
	});

	it("verifies through the port, settles as callback and redirects the web to the pending screen", async () => {
		const before = fake.callsTo("verifyPayment").length;

		const response = await callback("orderId=o-1");

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://web.test/checkout/o-1/pending",
		);
		expect(fake.callsTo("verifyPayment").slice(before)).toEqual([["PI-pi-1"]]);
		expect(intent().statusHistory?.at(-1)).toMatchObject({
			status: "succeeded",
			source: "callback",
		});
		expect(ofKind("charge")).toHaveLength(1);
	});

	it("hands the app its deep link, never the URL it was given", async () => {
		const response = await callback(
			"orderId=o-1&appReturnUrl=evil%3A%2F%2Fsteal",
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/html; charset=utf-8",
		);
		const html = await response.text();
		expect(html).toContain('"buynsellem://checkout/o-1/pending"');
		expect(html).not.toContain("evil");
		expect(order().paymentStatus).toBe("paid");
	});

	it("platform=mobile also asks for the deep link", async () => {
		const html = await (await callback("orderId=o-1&platform=mobile")).text();
		expect(html).toContain('"buynsellem://checkout/o-1/pending"');
	});

	it("does not call the provider once the intent is closed", async () => {
		await callback("orderId=o-1");
		const before = fake.callsTo("verifyPayment").length;

		const response = await callback("orderId=o-1");

		expect(response.headers.get("location")).toBe(
			"https://web.test/checkout/o-1/pending",
		);
		expect(fake.callsTo("verifyPayment").length).toBe(before);
	});

	it("a malformed orderId verifies nothing and lands on the web home", async () => {
		const before = fake.callsTo("verifyPayment").length;

		const response = await callback("orderId=..%2Fadmin");

		expect(response.headers.get("location")).toBe("https://web.test/");
		expect(fake.callsTo("verifyPayment").length).toBe(before);
		expect(order().paymentStatus).toBe("awaiting_payment");
	});
});

// ─── the fraud triggers ─────────────────────────────────────────────────────

describe("fraud triggers dispatched by the spine", () => {
	const fraudHolds = (scope: "order" | "shop") =>
		holds()
			.filter((h) => h.scope === scope && h.reason === "fraud_signal")
			.map((h) => ({
				shop: h.shop,
				order: h.order ?? null,
				until: h.until ?? null,
				status: h.status,
			}));

	it("a paid order of 200 000 XAF or more gets its order hold", async () => {
		const big = split(200_000, 13_000);
		world({ order: big, extra: { orders: priorOrders(3) } });

		expect(
			await deliverAll([paymentSucceeded({ amount: big.buyerTotal })]),
		).toEqual(["applied"]);

		expect(order().paymentStatus).toBe("paid");
		expect(fraudHolds("order")).toEqual([
			{ shop: SHOP, order: "o-1", until: null, status: "active" },
		]);
	});

	it("a smaller paid order past the shop's first three gets none", async () => {
		world({ extra: { orders: priorOrders(3) } });

		await payTheOrder();

		expect(paidNotes()).toHaveLength(1);
		expect(fraudHolds("order")).toEqual([]);
	});

	it("order.completed dates the first-orders hold to completion + 72 h", async () => {
		await payTheOrder();
		expect(fraudHolds("order")).toEqual([
			{ shop: SHOP, order: "o-1", until: null, status: "active" },
		]);
		const completedAt = at(-HOUR);
		const completed = {
			...order(),
			status: "completed",
			timestamps: { ...order().timestamps, completedAt },
		} as Order;
		payload.store.orders[0] = completed as unknown as Doc;

		__resetOrderEventHandlers();
		registerFraudTriggers();
		await runOrderEventHandlers(payload, completed, {
			id: "ev-completed",
			order: "o-1",
			type: "order.completed",
		} as OrderEvent);

		expect(fraudHolds("order")).toEqual([
			{
				shop: SHOP,
				order: "o-1",
				until: new Date(Date.parse(completedAt) + 72 * HOUR).toISOString(),
				status: "active",
			},
		]);
	});

	it("a refund event feeds the refund-rate rule: 2 refunded of 10 holds the shop", async () => {
		const prior = priorOrders(9);
		world({
			extra: {
				orders: prior,
				refunds: [
					{
						id: "rf-prior",
						order: "o-prior-1",
						shop: SHOP,
						amount: 1_000,
						currency: CURRENCY,
						reason: "order_cancelled",
						sourceType: "order",
						sourceId: "o-prior-1",
						idempotencyKey: "order:o-prior-1:1",
						status: "succeeded",
						createdAt: at(-DAY),
					},
				],
			},
		});
		await payTheOrder();
		const refund = await orderRefund();
		expect(fraudHolds("shop")).toEqual([]);

		await deliverAll([refundEvent(refund, "pending")]);

		expect(fraudHolds("shop")).toEqual([
			{ shop: SHOP, order: null, until: null, status: "active" },
		]);
		expect(holds().find((h) => h.scope === "shop")?.blocksCharges).toBe(true);
	});

	it("1 refunded of 10 stays under the rate: no shop hold", async () => {
		world({ extra: { orders: priorOrders(9) } });
		await payTheOrder();
		const refund = await orderRefund();

		expect(await deliverAll([refundEvent(refund, "pending")])).toEqual([
			"applied",
		]);
		expect(fraudHolds("shop")).toEqual([]);
	});
});
