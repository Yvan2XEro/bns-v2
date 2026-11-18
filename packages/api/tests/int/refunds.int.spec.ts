// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerCategory } from "../../src/collections/LedgerAccounts";
import { ERROR_CODES } from "../../src/lib/errors";
import { splitAmounts } from "../../src/lib/paymentMath";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
} from "../../src/lib/paymentSettings";
import type { SignedEvent } from "../../src/lib/payments/fakeMarketplace";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import type {
	DebitEvent,
	ProviderUnavailableError,
	RefundEvent,
} from "../../src/lib/payments/marketplace";
import { withTransaction } from "../../src/lib/transactions";
import type {
	LedgerTransaction,
	Order,
	ReconciliationMismatch,
	Refund,
} from "../../src/payload-types";
import {
	accountBalance,
	type LedgerLine,
	orderBalances,
	postingFor,
	postLedger,
	transactionLines,
} from "../../src/services/ledger";
import {
	notifyReceivableWrittenOff,
	notifyRefundCompleted,
	notifyRefundFailed,
	notifyRefundInitiated,
	notifyRefundStaffAlert,
} from "../../src/services/paymentNotifications";
import {
	createHold,
	hasBlockingHold,
	releaseHold,
} from "../../src/services/payoutHolds";
import { releaseEligibleFunds } from "../../src/services/payouts";
import {
	applyDebitEvent,
	applyRefundEvent,
	type RefundBreakdown,
	type RequestRefundInput,
	recoverSellerReceivables,
	refundBreakdown,
	registerRefundSubmissionQueue,
	requestRefund,
	submitRefund,
} from "../../src/services/refunds";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/services/paymentNotifications", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/paymentNotifications")
	>()),
	notifyRefundInitiated: vi.fn(async () => {}),
	notifyRefundCompleted: vi.fn(async () => {}),
	notifyRefundFailed: vi.fn(async () => {}),
	notifyRefundStaffAlert: vi.fn(async () => {}),
	notifyReceivableWrittenOff: vi.fn(async () => {}),
	notifyPayoutHoldReleased: vi.fn(async () => {}),
}));

const MARKET = DEFAULT_MARKETS[0];
const CURRENCY = MARKET.currency;
const SHOP = "s-1";
const BUYER = "u-buyer";
const ACCOUNT = "acct_1";

/** Two items, 28,000 and 17,000, plus 2,000 of delivery: 47,000 of order total. */
const SPLIT = splitAmounts({
	orderTotal: 47_000,
	commission: 3_153,
	vatRateBps: MARKET.vatRateBps,
	protection: PAYMENT_DEFAULTS.buyerProtection,
});
const G = SPLIT.buyerTotal;
const COMPONENTS: RefundBreakdown = {
	seller: SPLIT.destinationAmount,
	commission: SPLIT.commission,
	commissionVat: SPLIT.commissionVat,
	buyerProtectionFee: SPLIT.buyerProtectionFee,
};
const ZERO: RefundBreakdown = {
	seller: 0,
	commission: 0,
	commissionVat: 0,
	buyerProtectionFee: 0,
};

const PAID_AT = new Date("2026-10-01T08:00:00.000Z");
const NOW = new Date("2026-10-03T10:00:00.000Z");
const DAY = 86_400_000;

function orderDoc(id: string, extra: Partial<Order> = {}) {
	return {
		id,
		orderNumber: `BNS-${id}`,
		buyer: BUYER,
		shop: SHOP,
		status: "paid",
		paymentMethod: "mobile_money",
		paymentStatus: "paid",
		delivery: { recipientName: "Awa", phone: "+237670000001" },
		amounts: {
			subtotal: 45_000,
			deliveryFee: 2_000,
			total: G,
			currency: CURRENCY,
			buyerProtectionFee: SPLIT.buyerProtectionFee,
			buyerProtectionFeeVat: SPLIT.buyerProtectionFeeVat,
			commission: SPLIT.commission,
			commissionVat: SPLIT.commissionVat,
			applicationFee: SPLIT.applicationFee,
			destinationAmount: SPLIT.destinationAmount,
		},
		settlement: {
			mode: "provider_split",
			releaseModel: "provider_hold",
			connectedAccount: "ca-1",
			refundedAmount: 0,
		},
		createdAt: "2026-10-01T07:59:00.000Z",
		updatedAt: "2026-10-01T08:00:00.000Z",
		...extra,
	};
}

function intentDoc(id: string, order: string, paidAt = PAID_AT) {
	return {
		id,
		purpose: "checkout",
		targetType: "order",
		targetId: order,
		customer: BUYER,
		amount: G,
		currency: CURRENCY,
		provider: "notchpay",
		reference: `PI-${id}`,
		status: "succeeded",
		statusHistory: [
			{ status: "succeeded", source: "webhook", at: paidAt.toISOString() },
		],
		idempotencyKey: `checkout:${id}`,
		createdAt: paidAt.toISOString(),
		updatedAt: paidAt.toISOString(),
	};
}

let payload: FakePayload;
let fake: FakeMarketplaceProvider;
let clock: Date;
const queued: Array<{ refundId: string; waitUntil?: Date }> = [];
let unregister: () => void = () => {};

function world(seed: Record<string, Record<string, unknown>[]> = {}) {
	payload = fakePayload(
		{
			orders: [orderDoc("o-1")],
			"payment-intents": [intentDoc("pi-1", "o-1")],
			"connected-accounts": [
				{
					id: "ca-1",
					shop: SHOP,
					provider: "notchpay",
					providerAccountId: ACCOUNT,
					status: "active",
				},
			],
			shops: [{ id: SHOP, name: "Boutique", owner: "u-owner" }],
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
	clock = NOW;
	fake = new FakeMarketplaceProvider({
		now: () => clock,
		accounts: [{ accountId: ACCOUNT }],
	});
	fake.seedPayment({
		reference: "PI-pi-1",
		amount: G,
		currency: CURRENCY,
		status: "succeeded",
		accountId: ACCOUNT,
	});
	return payload;
}

beforeEach(() => {
	vi.clearAllMocks();
	queued.length = 0;
	unregister = registerRefundSubmissionQueue(async (_payload, job) => {
		queued.push(job);
	});
	world();
});

afterEach(() => unregister());

const refunds = () => (payload.store.refunds ?? []) as unknown as Refund[];
const transactions = () =>
	(payload.store["ledger-transactions"] ??
		[]) as unknown as LedgerTransaction[];
const order = (id = "o-1") =>
	payload.store.orders.find((o) => o.id === id) as unknown as Order;
const kinds = () => transactions().map((t) => t.kind);
const mismatches = () =>
	(payload.store["reconciliation-mismatches"] ??
		[]) as unknown as ReconciliationMismatch[];

const request = (input: Partial<RequestRefundInput> = {}, now = NOW) =>
	withTransaction(payload, (req) =>
		requestRefund(
			req,
			{
				order: "o-1",
				reason: "seller_declined",
				sourceType: "order",
				sourceId: "o-1",
				...input,
			},
			{ now },
		),
	);

const refundEventOf = (signed: SignedEvent): RefundEvent => {
	if (signed.event.entity !== "refund") throw new Error("not a refund event");
	return signed.event;
};
const debitEventOf = (signed: SignedEvent): DebitEvent => {
	if (signed.event.entity !== "debit") throw new Error("not a debit event");
	return signed.event;
};

const deliver = (signed: SignedEvent, now = NOW) =>
	withTransaction(payload, (req) =>
		applyRefundEvent(req, refundEventOf(signed), { now }),
	);

const submit = (id: string) =>
	submitRefund(payload, id, { provider: fake, now: NOW });

/** Charge (and optionally release) an order the way the ledger's callers do. */
async function charge(orderId: string, occurredAt: Date) {
	await withTransaction(payload, (req) =>
		postLedger(req, {
			kind: "charge",
			occurredAt,
			sourceType: "webhook-event",
			sourceId: `charge-${orderId}`,
			currency: CURRENCY,
			order: orderId,
			shop: SHOP,
			entries: postingFor("charge", SPLIT),
		}),
	);
}

async function release(orderId: string, occurredAt: Date) {
	await withTransaction(payload, async (req) => {
		await postLedger(req, {
			kind: "release",
			occurredAt,
			sourceType: "order-event",
			sourceId: `completed-${orderId}`,
			currency: CURRENCY,
			order: orderId,
			shop: SHOP,
			entries: postingFor("release", {
				amount: SPLIT.destinationAmount,
				releaseModel: "provider_hold",
			}),
		});
		await postLedger(req, {
			kind: "commission_earned",
			occurredAt,
			sourceType: "order-event",
			sourceId: `completed-${orderId}`,
			currency: CURRENCY,
			order: orderId,
			shop: SHOP,
			entries: postingFor("commission_earned", {
				commission: SPLIT.commission,
				commissionVat: SPLIT.commissionVat,
			}),
		});
	});
}

const balance = (category: LedgerCategory, shop: string | null = SHOP) =>
	accountBalance(payload, category, shop, CURRENCY);

async function linesOf(kind: string, refund?: string) {
	const tx = transactions().find(
		(t) => t.kind === kind && (!refund || String(t.refund) === refund),
	);
	if (!tx) throw new Error(`no ${kind} posting`);
	return withTransaction(payload, (req) => transactionLines(req, tx));
}

async function codeOf(work: Promise<unknown>): Promise<string> {
	try {
		await work;
	} catch (error) {
		return String((error as { code?: unknown }).code);
	}
	return "resolved";
}

describe("failed refund reverse-netting", () => {
	async function releasedOrder() {
		world({
			shops: [
				{ id: SHOP, name: "Boutique", owner: "u-owner", status: "active" },
			],
			"payout-accounts": [{ id: "pa-1", shop: SHOP, status: "active" }],
		});
		await charge("o-1", PAID_AT);
		await release("o-1", NOW);
		const stored = payload.store.orders[0];
		stored.status = "completed";
		stored.settlement = {
			...order().settlement,
			releaseEligibleAt: NOW.toISOString(),
		};
		return withTransaction(payload, (req) =>
			createHold(req, {
				scope: "order",
				shop: SHOP,
				order: "o-1",
				reason: "return_open",
				createdByType: "system",
			}),
		);
	}

	async function partial(sourceId: string, seller: number) {
		const row = await request({
			sourceType: "return-case",
			sourceId,
			amount: seller,
			breakdown: { ...ZERO, seller },
		});
		await submit(row.id);
		fake.script(row.idempotencyKey, [{ entity: "refund", status: "pending" }]);
		expect((await deliver(fake.advance(row.idempotencyKey))).outcome).toBe(
			"unchanged",
		);
		return row;
	}

	async function net(holdId: string, amount: number) {
		await withTransaction(payload, (req) => releaseHold(req, holdId));
		fake.failWhen("releasePayout", { times: 1 });
		const batch = await releaseEligibleFunds(payload, NOW, { provider: fake });
		expect(batch.payouts).toMatchObject([{ amount, status: "cancelled" }]);
	}

	function failure(row: Refund) {
		fake.script(row.idempotencyKey, [{ entity: "refund", status: "failed" }]);
		return fake.advance(row.idempotencyKey);
	}

	it("restores the netted 10,000 and pays the full 43,240 next batch without recovery", async () => {
		const hold = await releasedOrder();
		const row = await partial("rc-1", 10_000);
		expect(await balance("seller_receivable")).toBe(10_000);
		await net(hold.id, 33_240);
		expect(await balance("seller_receivable")).toBe(0);
		expect(await balance("seller_releasable")).toBe(33_240);

		expect((await deliver(failure(row))).outcome).toBe("applied");
		expect(await balance("seller_receivable")).toBe(0);
		expect(await balance("seller_releasable")).toBe(43_240);
		expect(await linesOf("netting_reversed")).toEqual([
			{ category: "seller_releasable", debit: 0, credit: 10_000 },
			{ category: "seller_receivable", debit: 10_000, credit: 0 },
		]);
		const netting = transactions().find((t) => t.kind === "clawback_recovered");
		expect(
			transactions().filter((t) => t.kind === "netting_reversed"),
		).toMatchObject([{ refund: row.id, reverses: netting?.id }]);

		payload.store.orders.push(orderDoc("o-2"));
		await charge("o-2", new Date(NOW.getTime() + 1));
		const recovery = await recoverSellerReceivables(payload, {
			provider: fake,
			now: NOW,
		});
		expect(recovery.debits).toEqual([]);
		expect(fake.callsTo("debitConnectedAccount")).toHaveLength(0);
		const next = await releaseEligibleFunds(payload, NOW, { provider: fake });
		expect(next.payouts).toMatchObject([{ amount: 43_240, status: "pending" }]);
		expect(
			fake.callsTo("releasePayout").map(([, payout]) => payout.amount),
		).toEqual([33_240, 43_240]);
		expect(
			transactions().filter((t) => t.kind === "clawback_recovered"),
		).toHaveLength(1);
	});

	it("reverses only the failed refund's source on a two-refund order, once on duplicate delivery", async () => {
		const hold = await releasedOrder();
		const first = await partial("rc-1", 10_000);
		const second = await partial("rc-2", 5_000);
		await net(hold.id, 28_240);
		expect(
			transactions().filter((t) => t.kind === "clawback_recovered"),
		).toHaveLength(2);
		const failed = failure(second);
		expect((await deliver(failed)).outcome).toBe("applied");
		expect((await deliver(failed)).outcome).toBe("unchanged");
		expect(await balance("seller_receivable")).toBe(0);
		expect(await balance("seller_releasable")).toBe(33_240);
		const secondSubmission = transactions().find(
			(t) => t.kind === "refund_submitted" && t.refund === second.id,
		);
		const secondNetting = transactions().find(
			(t) =>
				t.kind === "clawback_recovered" &&
				t.sourceId === secondSubmission?.sourceId,
		);
		expect(
			transactions().filter((t) => t.kind === "netting_reversed"),
		).toMatchObject([{ refund: second.id, reverses: secondNetting?.id }]);
		expect(
			transactions().filter((t) => t.kind === "netting_reversed"),
		).toHaveLength(1);
		expect(
			transactions().filter((t) => t.kind === "refund_failed"),
		).toHaveLength(1);
		expect(refunds().find((r) => r.id === first.id)?.status).toBe("pending");
		const next = await releaseEligibleFunds(payload, NOW, { provider: fake });
		expect(next.payouts).toMatchObject([{ amount: 33_240, status: "pending" }]);
		expect(
			transactions().filter((t) => t.kind === "clawback_recovered"),
		).toHaveLength(2);
	});

	it("posts no netting reversal for a failed refund without an original netting", async () => {
		await releasedOrder();
		const row = await partial("rc-1", 10_000);
		expect(await balance("seller_receivable")).toBe(10_000);
		expect((await deliver(failure(row))).outcome).toBe("applied");
		expect(
			transactions().filter((t) => t.kind === "refund_failed"),
		).toHaveLength(1);
		expect(
			transactions().filter((t) => t.kind === "netting_reversed"),
		).toHaveLength(0);
		expect(await balance("seller_receivable")).toBe(0);
		expect(await balance("seller_releasable")).toBe(43_240);
	});

	it("rolls back refund failure and restored funds together if the netting reversal cannot be written", async () => {
		const hold = await releasedOrder();
		const row = await partial("rc-1", 10_000);
		await net(hold.id, 33_240);
		const failed = failure(row);
		payload.failWhen = (method, args) =>
			method === "create" &&
			args.collection === "ledger-transactions" &&
			args.data?.kind === "netting_reversed";
		await expect(deliver(failed)).rejects.toThrow();
		expect(refunds().find((r) => r.id === row.id)?.status).toBe("pending");
		expect(
			transactions().filter((t) => t.kind === "refund_failed"),
		).toHaveLength(0);
		expect(await balance("seller_releasable")).toBe(33_240);
		payload.failWhen = null;
		expect((await deliver(failed)).outcome).toBe("applied");
		expect(await balance("seller_receivable")).toBe(0);
		expect(await balance("seller_releasable")).toBe(43_240);
	});
});

describe("refund breakdown arithmetic", () => {
	it("pins the worked order's components", () => {
		expect(COMPONENTS).toEqual({
			seller: 43_240,
			commission: 3_153,
			commissionVat: 607,
			buyerProtectionFee: 1_410,
		});
		expect(G).toBe(48_410);
	});

	it("returns every component, the protection fee included, on a full refund", () => {
		expect(
			refundBreakdown({
				components: COMPONENTS,
				refunded: ZERO,
				goodsValue: 45_000,
				amount: G,
			}),
		).toEqual(COMPONENTS);
	});

	it("takes commission in proportion to the refunded goods value and never the fee, item by item", () => {
		// Item B (17,000 of 45,000 of goods): 3,153 × 17/45 = 1,191.13 → 1,191;
		// 607 × 17/45 = 229.31 → 229; the seller part carries the rest.
		const itemB = refundBreakdown({
			components: COMPONENTS,
			refunded: ZERO,
			goodsValue: 45_000,
			amount: 17_000,
		});
		expect(itemB).toEqual({
			seller: 15_580,
			commission: 1_191,
			commissionVat: 229,
			buyerProtectionFee: 0,
		});
		if (!itemB) throw new Error("unreachable");
		// Item A (28,000): 3,153 × 28/45 = 1,961.87 → 1,962; 607 × 28/45 = 377.69 → 378.
		const itemA = refundBreakdown({
			components: COMPONENTS,
			refunded: itemB,
			goodsValue: 45_000,
			amount: 28_000,
		});
		expect(itemA).toEqual({
			seller: 25_660,
			commission: 1_962,
			commissionVat: 378,
			buyerProtectionFee: 0,
		});
		if (!itemA) throw new Error("unreachable");
		const both: RefundBreakdown = {
			seller: itemA.seller + itemB.seller,
			commission: itemA.commission + itemB.commission,
			commissionVat: itemA.commissionVat + itemB.commissionVat,
			buyerProtectionFee: 0,
		};
		// What remains is the delivery's seller part and the whole fee: the
		// last refund of the order returns exactly that.
		expect(
			refundBreakdown({
				components: COMPONENTS,
				refunded: both,
				goodsValue: 45_000,
				amount: 3_410,
			}),
		).toEqual({
			seller: 2_000,
			commission: 0,
			commissionVat: 0,
			buyerProtectionFee: 1_410,
		});
		// Anything between the non-fee remainder and the whole remainder would
		// need the fee: refused rather than touching it.
		expect(
			refundBreakdown({
				components: COMPONENTS,
				refunded: both,
				goodsValue: 45_000,
				amount: 3_000,
			}),
		).toBeNull();
	});

	it("stores the computed split on the row", async () => {
		const row = await request({ amount: 17_000 });
		expect(row.breakdown).toEqual({
			seller: 15_580,
			commission: 1_191,
			commissionVat: 229,
			buyerProtectionFee: 0,
		});
		const full = await request({ sourceType: "moderation", sourceId: "m-1" });
		expect([full.amount, full.breakdown]).toEqual([
			G - 17_000,
			{
				seller: 43_240 - 15_580,
				commission: 3_153 - 1_191,
				commissionVat: 607 - 229,
				buyerProtectionFee: 1_410,
			},
		]);
	});
});

describe("requestRefund", () => {
	it("creates the row with its buyer and shop, raises refundedAmount and queues the submission — paymentStatus untouched", async () => {
		const row = await request({ amount: 17_000 });
		expect(refunds()).toHaveLength(1);
		expect(row).toMatchObject({
			order: "o-1",
			paymentIntent: "pi-1",
			buyer: BUYER,
			shop: SHOP,
			amount: 17_000,
			reason: "seller_declined",
			sourceType: "order",
			sourceId: "o-1",
			status: "created",
			statusHistory: [
				{ status: "created", source: "system", at: NOW.toISOString() },
			],
			fundedBy: "connected_account",
			idempotencyKey: "order:o-1:1",
			attempts: 0,
		});
		expect(order().settlement?.refundedAmount).toBe(17_000);
		expect(order().paymentStatus).toBe("paid");
		expect(queued).toEqual([{ refundId: String(row.id) }]);
		expect(vi.mocked(notifyRefundInitiated).mock.calls).toEqual([
			[
				payload,
				{
					refundId: String(row.id),
					orderId: "o-1",
					buyerId: BUYER,
					shopId: SHOP,
					amount: 17_000,
					currency: CURRENCY,
					reason: "seller_declined",
				},
			],
		]);
	});

	it("returns the live row when the same source asks again, writing nothing", async () => {
		const first = await request({ amount: 17_000 });
		const second = await request({ amount: 17_000 });
		expect(second.id).toBe(first.id);
		expect(refunds()).toHaveLength(1);
		expect(order().settlement?.refundedAmount).toBe(17_000);
	});

	it("rolls the row back when the refunded amount cannot be written", async () => {
		let reached = 0;
		payload.failWhen = (method, args) => {
			const hit = method === "db.updateOne" && args.collection === "orders";
			if (hit) reached += 1;
			return hit;
		};
		expect(await codeOf(request({ amount: 17_000 }))).toBe("undefined");
		expect(reached).toBe(1);
		expect(refunds()).toEqual([]);
		expect(order().settlement?.refundedAmount).toBe(0);
		expect(queued).toEqual([]);
	});

	describe("the ladder of refusals", () => {
		it("refuses an order no succeeded intent paid: refund.notRefundable", async () => {
			world({
				orders: [
					orderDoc("o-1", {
						paymentMethod: "cod",
						paymentStatus: "cod_collected",
					}),
				],
				"payment-intents": [],
			});
			expect(await codeOf(request())).toBe(ERROR_CODES.refundNotRefundable);
			expect(refunds()).toEqual([]);
		});

		it("refuses a payment older than 85 days: refund.windowExpired", async () => {
			const at85 = new Date(PAID_AT.getTime() + 85 * DAY);
			expect(await codeOf(request({}, new Date(at85.getTime() + 60_000)))).toBe(
				ERROR_CODES.refundWindowExpired,
			);
			expect(refunds()).toEqual([]);
			const within = await request({}, new Date(at85.getTime() - 60_000));
			expect(within.amount).toBe(G);
		});

		it("refuses more than the buyer total less what is already refunded: refund.amountExceeds", async () => {
			expect(await codeOf(request({ amount: G + 1 }))).toBe(
				ERROR_CODES.refundAmountExceeds,
			);
			await request({ amount: 17_000 });
			expect(
				await codeOf(
					request({
						amount: G - 17_000 + 1,
						sourceType: "dispute",
						sourceId: "d-1",
					}),
				),
			).toBe(ERROR_CODES.refundAmountExceeds);
			const rest = await request({
				amount: G - 17_000,
				sourceType: "dispute",
				sourceId: "d-1",
			});
			expect(rest.breakdown?.buyerProtectionFee).toBe(1_410);
			expect(order().settlement?.refundedAmount).toBe(G);
		});

		it("refuses a partial refund that would reach into the protection fee", async () => {
			expect(await codeOf(request({ amount: G - 1 }))).toBe(
				ERROR_CODES.refundAmountExceeds,
			);
			const largest = await request({ amount: G - 1_410 });
			expect(largest.breakdown?.buyerProtectionFee).toBe(0);
		});

		it("refuses an order with releasable funds until an order hold return_open or dispute_open exists", async () => {
			await charge("o-1", PAID_AT);
			await release("o-1", NOW);
			expect(
				await codeOf(request({ sourceType: "return-case", sourceId: "rc-1" })),
			).toBe(ERROR_CODES.refundNotRefundable);
			// An order hold for another reason does not open the way.
			await withTransaction(payload, (req) =>
				createHold(req, {
					scope: "order",
					shop: SHOP,
					order: "o-1",
					reason: "fraud_signal",
					createdByType: "system",
				}),
			);
			expect(
				await codeOf(request({ sourceType: "return-case", sourceId: "rc-1" })),
			).toBe(ERROR_CODES.refundNotRefundable);
			expect(refunds()).toEqual([]);

			await withTransaction(payload, (req) =>
				createHold(req, {
					scope: "order",
					shop: SHOP,
					order: "o-1",
					reason: "return_open",
					createdByType: "system",
				}),
			);
			const row = await request({
				sourceType: "return-case",
				sourceId: "rc-1",
			});
			expect([row.status, row.amount, refunds().length]).toEqual([
				"created",
				G,
				1,
			]);
		});

		it("does not ask for a hold while the funds are still pending", async () => {
			await charge("o-1", PAID_AT);
			const row = await request();
			expect(row.status).toBe("created");
		});
	});

	it("refunds a duplicate payment against its own intent, outside the order's budget", async () => {
		world({
			"payment-intents": [intentDoc("pi-1", "o-1"), intentDoc("pi-2", "o-1")],
		});
		const row = await request({
			reason: "duplicate_payment",
			sourceType: "payment-intent",
			sourceId: "pi-2",
		});
		expect([row.paymentIntent, row.amount, row.idempotencyKey]).toEqual([
			"pi-2",
			G,
			"payment-intent:pi-2:1",
		]);
		expect(order().settlement?.refundedAmount).toBe(0);
	});
});

describe("submitRefund", () => {
	it("retries a provider outage with one provider call per attempt, then lands pending under the row's key", async () => {
		const row = await request({ amount: 17_000 });
		fake.failWhen("createRefund", { times: 2 });

		const outcomes: string[] = [];
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				outcomes.push((await submit(String(row.id))).status);
			} catch (error) {
				outcomes.push((error as ProviderUnavailableError).name);
			}
		}
		expect(outcomes).toEqual([
			"ProviderUnavailableError",
			"ProviderUnavailableError",
			"pending",
		]);
		const call = {
			paymentReference: "PI-pi-1",
			amount: 17_000,
			reason: "seller_declined",
			idempotencyKey: "order:o-1:1",
		};
		expect(fake.callsTo("createRefund")).toEqual([[call], [call], [call]]);
		expect(
			fake.calls
				.filter((c) => c.method === "createRefund")
				.map((c) => c.rejected),
		).toEqual([true, true, false]);
		expect(refunds()[0]).toMatchObject({
			status: "pending",
			attempts: 3,
			providerRefundId: "re_1",
		});
		// Our own submission is not a provider fact: nothing is posted yet.
		expect(kinds()).toEqual([]);

		// A late duplicate of the job does not call the provider again.
		expect((await submit(String(row.id))).status).toBe("pending");
		expect(fake.callsTo("createRefund")).toHaveLength(3);
	});

	it("fails the row on the last attempt and schedules the one retry an hour later", async () => {
		const row = await request({ amount: 17_000 });
		fake.failWhen("createRefund");
		let thrown = 0;
		let last: string | null = null;
		for (let attempt = 0; attempt < 6; attempt++) {
			try {
				last = (await submit(String(row.id))).status;
			} catch {
				thrown += 1;
			}
		}
		expect([thrown, last]).toEqual([5, "failed"]);
		expect(fake.callsTo("createRefund")).toHaveLength(6);
		const [failed, retry] = refunds();
		expect(failed).toMatchObject({ status: "failed", attempts: 6 });
		expect(retry).toMatchObject({
			status: "created",
			retryOf: String(row.id),
			idempotencyKey: "order:o-1:2",
			amount: 17_000,
			buyer: BUYER,
			shop: SHOP,
		});
		expect(queued).toEqual([
			{ refundId: String(row.id) },
			{
				refundId: String(retry?.id),
				waitUntil: new Date(NOW.getTime() + 3_600_000),
			},
		]);
		expect(order().settlement?.refundedAmount).toBe(17_000);
	});
});

describe("applyRefundEvent", () => {
	async function submitted(amount?: number) {
		const row = await request(amount ? { amount } : {});
		await submit(String(row.id));
		return row;
	}

	it("posts refund_submitted then refund_complete and only then marks the order refunded", async () => {
		await charge("o-1", PAID_AT);
		const row = await submitted();
		fake.script("order:o-1:1", [
			{ entity: "refund", status: "pending" },
			{ entity: "refund", status: "succeeded" },
		]);
		const [created, complete] = fake.advanceAll("order:o-1:1");
		if (!created || !complete) throw new Error("unreachable");

		expect((await deliver(created)).outcome).toBe("unchanged");
		expect(order().paymentStatus).toBe("paid");
		expect(await linesOf("refund_submitted")).toEqual([
			{ category: "seller_pending", debit: 43_240, credit: 0 },
			{ category: "platform_fee_unearned", debit: 3_760, credit: 0 },
			{ category: "platform_revenue_protection_fee", debit: 1_182, credit: 0 },
			{ category: "vat_payable", debit: 228, credit: 0 },
			{ category: "buyer_refund_in_transit", debit: 0, credit: G },
		]);

		expect((await deliver(complete)).outcome).toBe("applied");
		expect(kinds()).toEqual(["charge", "refund_submitted", "refund_complete"]);
		expect(await balance("buyer_refund_in_transit", null)).toBe(0);
		expect(await balance("provider_position", null)).toBe(0);
		const stored = refunds()[0];
		expect(stored?.statusHistory?.map((h) => [h.status, h.source])).toEqual([
			["created", "system"],
			["pending", "system"],
			["succeeded", "webhook"],
		]);
		expect(order().paymentStatus).toBe("refunded");
		const events = payload.store["order-events"] ?? [];
		expect(
			events.map((e) => [e.type, e.paymentStatusFrom, e.paymentStatusTo]),
		).toEqual([["order.note_added", "paid", "refunded"]]);
		expect(vi.mocked(notifyRefundCompleted).mock.calls).toHaveLength(1);
		expect(vi.mocked(notifyRefundCompleted).mock.calls[0]?.[1]).toMatchObject({
			refundId: String(row.id),
			amount: G,
		});
	});

	it("credits the buyer fee invoice when a refund gives the fee back, and only then", async () => {
		await charge("o-1", PAID_AT);
		await submitted(17_000);
		fake.script("order:o-1:1", [{ entity: "refund", status: "succeeded" }]);
		await deliver(fake.advance("order:o-1:1"));
		expect(payload.store["buyer-fee-invoices"] ?? []).toEqual([]);

		const rest = await request({ sourceType: "dispute", sourceId: "d-1" });
		expect(rest.breakdown?.buyerProtectionFee).toBe(SPLIT.buyerProtectionFee);
		await submit(String(rest.id));
		fake.script("dispute:d-1:1", [{ entity: "refund", status: "succeeded" }]);
		await deliver(fake.advance("dispute:d-1:1"));

		const docs = payload.store["buyer-fee-invoices"] ?? [];
		expect(docs.map((d) => [d.kind, d.order, d.amountTtc])).toEqual([
			["invoice", "o-1", SPLIT.buyerProtectionFee],
			["credit_note", "o-1", SPLIT.buyerProtectionFee],
		]);
		expect(docs[1]?.creditsInvoice).toBe(docs[0]?.id);
	});

	it("moves a partial refund to partially_refunded, and the last one to refunded", async () => {
		await charge("o-1", PAID_AT);
		await submitted(17_000);
		fake.script("order:o-1:1", [{ entity: "refund", status: "succeeded" }]);
		await deliver(fake.advance("order:o-1:1"));
		expect(order().paymentStatus).toBe("partially_refunded");

		const rest = await request({ sourceType: "dispute", sourceId: "d-1" });
		await submit(String(rest.id));
		fake.script("dispute:d-1:1", [{ entity: "refund", status: "succeeded" }]);
		await deliver(fake.advance("dispute:d-1:1"));
		expect(order().paymentStatus).toBe("refunded");
		expect(
			(payload.store["order-events"] ?? []).map((e) => e.paymentStatusTo),
		).toEqual(["partially_refunded", "refunded"]);
	});

	it("lands refund.complete delivered before refund.created once: one state, one posting each", async () => {
		await charge("o-1", PAID_AT);
		await submitted();
		fake.script("order:o-1:1", [
			{ entity: "refund", status: "pending" },
			{ entity: "refund", status: "succeeded" },
		]);
		const [created, complete] = fake.advanceAll("order:o-1:1");
		if (!created || !complete) throw new Error("unreachable");

		expect((await deliver(complete)).outcome).toBe("applied");
		expect((await deliver(created)).outcome).toBe("stale");
		expect((await deliver(complete)).outcome).toBe("unchanged");
		expect(kinds()).toEqual(["charge", "refund_submitted", "refund_complete"]);
		expect(refunds()[0]?.status).toBe("succeeded");
		expect(order().paymentStatus).toBe("refunded");
		expect(payload.store["order-events"]).toHaveLength(1);
	});

	it("walks a row still created through pending when the provider's success overtakes our own submission", async () => {
		await charge("o-1", PAID_AT);
		const row = await request();
		await fake.createRefund({
			paymentReference: "PI-pi-1",
			amount: G,
			reason: "seller_declined",
			idempotencyKey: "order:o-1:1",
		});
		fake.script("order:o-1:1", [{ entity: "refund", status: "succeeded" }]);
		await deliver(fake.advance("order:o-1:1"));
		expect(refunds()[0]).toMatchObject({
			status: "succeeded",
			providerRefundId: "re_1",
		});
		expect(refunds()[0]?.statusHistory?.map((h) => h.status)).toEqual([
			"created",
			"pending",
			"succeeded",
		]);
		// The job arriving late finds the row submitted and leaves it.
		expect((await submit(String(row.id))).status).toBe("succeeded");
		expect(fake.callsTo("createRefund")).toHaveLength(1);
	});

	it("reverses the stored submission line for line on refund.failed and refuses a complete after it", async () => {
		await charge("o-1", PAID_AT);
		const row = await submitted(17_000);
		fake.script("order:o-1:1", [
			{ entity: "refund", status: "pending" },
			{ entity: "refund", status: "failed", failureReason: "account short" },
		]);
		const [created, failed] = fake.advanceAll("order:o-1:1");
		if (!created || !failed) throw new Error("unreachable");
		await deliver(created);
		expect((await deliver(failed)).outcome).toBe("applied");

		const submittedTx = transactions().find(
			(t) => t.kind === "refund_submitted",
		);
		const reversal = transactions().find((t) => t.kind === "refund_failed");
		expect(String(reversal?.reverses)).toBe(String(submittedTx?.id));
		const forward = await linesOf("refund_submitted");
		expect(await linesOf("refund_failed")).toEqual(
			forward.map((l: LedgerLine) => ({
				category: l.category,
				debit: l.credit,
				credit: l.debit,
			})),
		);
		expect(await balance("buyer_refund_in_transit", null)).toBe(0);
		expect(
			(await withTransaction(payload, (req) => orderBalances(req, "o-1")))
				.seller_pending,
		).toBe(43_240);

		const complete = fake.emit({
			...refundEventOf(failed),
			providerEventId: undefined,
			type: undefined,
			status: "succeeded",
		});
		expect((await deliver(complete)).outcome).toBe("contradicted");
		const stored = refunds().find((r) => r.id === row.id);
		expect(stored?.status).toBe("failed");
		expect(kinds().filter((k) => k === "refund_complete")).toEqual([]);
		expect(order().paymentStatus).toBe("paid");
		expect(
			mismatches().map((m) => [
				m.kind,
				m.localId,
				m.expected,
				m.actual,
				m.status,
			]),
		).toEqual([
			[
				"status_mismatch",
				String(row.id),
				{ status: "failed" },
				{ status: "succeeded", source: "webhook" },
				"open",
			],
		]);
	});

	it("retries a failed refund once, an hour later, and sends a second failure to staff", async () => {
		await charge("o-1", PAID_AT);
		const first = await submitted(17_000);
		fake.script("order:o-1:1", [{ entity: "refund", status: "failed" }]);
		await deliver(fake.advance("order:o-1:1"));

		const retry = refunds().find((r) => String(r.retryOf) === String(first.id));
		expect(retry).toMatchObject({
			idempotencyKey: "order:o-1:2",
			status: "created",
		});
		expect(queued.at(-1)).toEqual({
			refundId: String(retry?.id),
			waitUntil: new Date(NOW.getTime() + 3_600_000),
		});
		expect(order().settlement?.refundedAmount).toBe(17_000);
		expect(mismatches()).toEqual([]);
		expect(vi.mocked(notifyRefundStaffAlert).mock.calls).toEqual([]);

		await submit(String(retry?.id));
		fake.script("order:o-1:2", [
			{
				entity: "refund",
				status: "failed",
				failureReason: "insufficient balance",
			},
		]);
		await deliver(fake.advance("order:o-1:2"));

		expect(refunds().map((r) => [r.idempotencyKey, r.status])).toEqual([
			["order:o-1:1", "failed"],
			["order:o-1:2", "failed"],
		]);
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
				kind: "status_mismatch",
				entityType: "refund",
				localId: String(retry?.id),
				providerId: "re_2",
				expected: { status: "succeeded", amount: 17_000 },
				actual: { status: "failed", reason: null },
				shop: SHOP,
				status: "open",
			},
		]);
		expect(order().settlement?.refundedAmount).toBe(0);
		expect(vi.mocked(notifyRefundStaffAlert).mock.calls).toHaveLength(1);
		expect(vi.mocked(notifyRefundStaffAlert).mock.calls[0]?.[1]).toMatchObject({
			refundId: String(retry?.id),
			mismatchId: String(mismatches()[0]?.id),
		});
		expect(vi.mocked(notifyRefundFailed).mock.calls).toHaveLength(1);
		// No third row: the ladder ends with staff.
		expect(refunds()).toHaveLength(2);
	});

	it("ignores an event for a refund it does not know", async () => {
		const signed = fake.emit({
			entity: "refund",
			reference: "order:nope:1",
			status: "succeeded",
			amount: 1,
			currency: CURRENCY,
			providerTransactionId: "re_x",
			refundId: "re_x",
			paymentReference: "PI-x",
			accountId: null,
			fee: null,
		});
		expect((await deliver(signed)).outcome).toBe("unknown");
		expect(kinds()).toEqual([]);
	});
});

describe("clawback and write-off", () => {
	const REFUND_AT = new Date("2026-10-03T10:00:00.000Z");

	/**
	 * o-1 released, then fully refunded under a return hold: its seller part
	 * becomes a receivable. Paid out by default — the receivable is then a
	 * real debt; while o-1's money is still unpaid, the next payout batch nets
	 * it instead (`payouts.ts`).
	 */
	async function receivable({ paidOut = true } = {}) {
		await charge("o-1", PAID_AT);
		await release("o-1", new Date("2026-10-02T10:00:00.000Z"));
		if (paidOut) {
			const o1 = payload.store.orders.find((o) => o.id === "o-1");
			if (o1) {
				o1.settlement = {
					...(o1.settlement as Record<string, unknown>),
					releasedAt: "2026-10-02T12:00:00.000Z",
				};
			}
		}
		await withTransaction(payload, (req) =>
			createHold(req, {
				scope: "order",
				shop: SHOP,
				order: "o-1",
				reason: "return_open",
				createdByType: "system",
			}),
		);
		const row = await request({ sourceType: "return-case", sourceId: "rc-1" });
		await submit(String(row.id));
		fake.script("return-case:rc-1:1", [
			{ entity: "refund", status: "pending" },
		]);
		await deliver(fake.advance("return-case:rc-1:1"), REFUND_AT);
	}

	function newOrder(id: string, at: Date) {
		payload.store.orders.push(orderDoc(id, { createdAt: at.toISOString() }));
		return charge(id, at);
	}

	it("books a shortfall to seller_receivable when the order's pending funds are gone", async () => {
		await receivable();
		expect(await linesOf("refund_submitted")).toEqual([
			{ category: "seller_receivable", debit: 43_240, credit: 0 },
			{ category: "platform_revenue_commission", debit: 3_153, credit: 0 },
			{ category: "vat_payable", debit: 607 + 228, credit: 0 },
			{ category: "platform_revenue_protection_fee", debit: 1_182, credit: 0 },
			{ category: "buyer_refund_in_transit", debit: 0, credit: G },
		]);
		expect(await balance("seller_receivable")).toBe(43_240);
	});

	it("recovers at most half of a later charge's destination amount, once per charge, and posts the recovery on the debit's success", async () => {
		await receivable();
		await newOrder("o-2", new Date("2026-10-04T09:00:00.000Z"));
		clock = new Date("2026-10-05T03:00:00.000Z");

		const first = await recoverSellerReceivables(payload, {
			provider: fake,
			now: clock,
		});
		expect(first.debits).toEqual([
			{ shop: SHOP, order: "o-2", amount: 21_620, reference: "CB-o-2" },
		]);
		expect(fake.callsTo("debitConnectedAccount")).toEqual([
			[
				ACCOUNT,
				{
					amount: 21_620,
					reference: "CB-o-2",
					description: "Recovery of a refund the seller's funds did not cover",
				},
			],
		]);

		// The debit is still in flight: the next run asks for nothing more.
		const second = await recoverSellerReceivables(payload, {
			provider: fake,
			now: clock,
		});
		expect(second.debits).toEqual([]);
		expect(fake.callsTo("debitConnectedAccount")).toHaveLength(1);

		fake.script("CB-o-2", [{ entity: "debit", status: "succeeded" }]);
		const signed = fake.advance("CB-o-2");
		const apply = () =>
			withTransaction(payload, (req) =>
				applyDebitEvent(req, debitEventOf(signed), { now: clock }),
			);
		expect((await apply()).outcome).toBe("posted");
		expect((await apply()).outcome).toBe("duplicate");
		expect(await linesOf("clawback_recovered")).toEqual([
			{ category: "seller_pending", debit: 21_620, credit: 0 },
			{ category: "seller_receivable", debit: 0, credit: 21_620 },
		]);
		expect(await balance("seller_receivable")).toBe(43_240 - 21_620);
		expect(
			(await withTransaction(payload, (req) => orderBalances(req, "o-2")))
				.seller_pending,
		).toBe(43_240 - 21_620);
	});

	it("leaves alone a receivable the order's own unpaid releasable money will net: no debit, no write-off", async () => {
		await receivable({ paidOut: false });
		await newOrder("o-2", new Date("2026-10-04T09:00:00.000Z"));
		expect(await balance("seller_receivable")).toBe(43_240);
		expect(await balance("seller_releasable")).toBe(43_240);

		const nextDay = await recoverSellerReceivables(payload, {
			provider: fake,
			now: new Date("2026-10-05T03:00:00.000Z"),
		});
		const day60 = await recoverSellerReceivables(payload, {
			provider: fake,
			now: new Date(REFUND_AT.getTime() + 60 * DAY),
		});

		expect([nextDay.debits, nextDay.writeOffs]).toEqual([[], []]);
		expect([day60.debits, day60.writeOffs, day60.suspended]).toEqual([
			[],
			[],
			[],
		]);
		expect(fake.callsTo("debitConnectedAccount")).toEqual([]);
		expect(kinds()).not.toContain("guarantee_writeoff");
		expect(kinds()).not.toContain("clawback_recovered");
	});

	it("recovers only the part of the receivable the order's unpaid money cannot net", async () => {
		await receivable({ paidOut: false });
		// 10,000 of o-1's 43,240 already left in a live payout (an early release).
		payload.store.payouts = [
			{
				id: "po-early",
				shop: SHOP,
				status: "complete",
				origin: "platform_release",
				amount: 10_000,
				orders: [{ order: "o-1", amount: 10_000 }],
			},
		];
		await newOrder("o-2", new Date("2026-10-04T09:00:00.000Z"));

		const result = await recoverSellerReceivables(payload, {
			provider: fake,
			now: new Date("2026-10-05T03:00:00.000Z"),
		});

		expect(result.debits).toEqual([
			{ shop: SHOP, order: "o-2", amount: 10_000, reference: "CB-o-2" },
		]);
	});

	it("does not recover from a charge older than the receivable", async () => {
		await newOrder("o-0", new Date("2026-09-30T09:00:00.000Z"));
		await receivable();
		const result = await recoverSellerReceivables(payload, {
			provider: fake,
			now: NOW,
		});
		expect(result.debits).toEqual([]);
		expect(fake.callsTo("debitConnectedAccount")).toEqual([]);
		expect(await balance("seller_receivable")).toBe(43_240);
	});

	it("writes off what is unrecovered after 60 days and suspends the shop's protected payment", async () => {
		await receivable();
		expect(
			await withTransaction(payload, (req) =>
				hasBlockingHold(payload, SHOP, req),
			),
		).toBe(false);

		const day59 = new Date(REFUND_AT.getTime() + 59 * DAY);
		const early = await recoverSellerReceivables(payload, {
			provider: fake,
			now: day59,
		});
		expect([early.writeOffs, early.suspended]).toEqual([[], []]);
		expect(kinds()).not.toContain("guarantee_writeoff");

		const day60 = new Date(REFUND_AT.getTime() + 60 * DAY);
		const due = await recoverSellerReceivables(payload, {
			provider: fake,
			now: day60,
		});
		expect(due.writeOffs.map((w) => [w.shop, w.amount])).toEqual([
			[SHOP, 43_240],
		]);
		expect(due.suspended).toEqual([SHOP]);
		expect(await linesOf("guarantee_writeoff")).toEqual([
			{ category: "buyer_guarantee_expense", debit: 43_240, credit: 0 },
			{ category: "seller_receivable", debit: 0, credit: 43_240 },
		]);
		expect(await balance("seller_receivable")).toBe(0);
		expect(await balance("buyer_guarantee_expense", null)).toBe(43_240);

		const holds = (payload.store["payout-holds"] ?? []).filter(
			(h) => h.scope === "shop",
		);
		expect(holds.map((h) => [h.reason, h.status, h.blocksCharges])).toEqual([
			["fraud_signal", "active", true],
		]);
		expect(
			await withTransaction(payload, (req) =>
				hasBlockingHold(payload, SHOP, req),
			),
		).toBe(true);
		expect(vi.mocked(notifyReceivableWrittenOff).mock.calls).toEqual([
			[
				payload,
				{
					shopId: SHOP,
					amount: 43_240,
					currency: CURRENCY,
					holdId: String(holds[0]?.id),
				},
			],
		]);

		const again = await recoverSellerReceivables(payload, {
			provider: fake,
			now: new Date(day60.getTime() + DAY),
		});
		expect(again.writeOffs).toEqual([]);
		expect(kinds().filter((k) => k === "guarantee_writeoff")).toHaveLength(1);
	});
});
