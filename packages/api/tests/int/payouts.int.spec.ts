// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notifications = vi.hoisted(() => ({
	notifyPayoutHoldReleased: vi.fn(
		async (_shop: unknown, _notice: unknown) => {},
	),
	notifyPayoutSent: vi.fn(async (_shop: unknown, _notice: unknown) => {}),
	notifyPayoutFailed: vi.fn(async (_shop: unknown, _notice: unknown) => {}),
	notifyPayoutHoldPlaced: vi.fn(async (_shop: unknown, _notice: unknown) => {}),
}));
vi.mock("../../src/services/paymentNotifications", () => notifications);

const invoices = vi.hoisted(() => ({
	issueApplicationFeeCommissionInvoice: vi.fn(
		async (_req: unknown, _order: unknown) => {},
	),
}));
vi.mock("../../src/services/buyerFeeInvoices", () => invoices);

import type { LedgerCategory } from "../../src/collections/LedgerAccounts";
import type { LedgerTransactionKind } from "../../src/collections/LedgerTransactions";
import { splitAmounts } from "../../src/lib/paymentMath";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
} from "../../src/lib/paymentSettings";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import type {
	NormalisedEvent,
	TransferEvent,
} from "../../src/lib/payments/marketplace";
import { withTransaction } from "../../src/lib/transactions";
import type {
	LedgerAccount,
	LedgerTransaction,
	Order,
	OrderEvent,
	Payout,
} from "../../src/payload-types";
import {
	accountBalance,
	type LedgerLine,
	postingFor,
	postLedger,
} from "../../src/services/ledger";
import {
	__resetOrderEventHandlers,
	runOrderEventHandlers,
} from "../../src/services/orders/events";
import { releaseHold } from "../../src/services/payoutHolds";
import {
	applyTransferEvent,
	earlyReleaseAmount,
	earlyReleaseEligible,
	earlyReleaseStats,
	exposureCap,
	payoutReference,
	providerScheduleEligible,
	providerScheduleRefusals,
	providerScheduleStats,
	registerPayoutHandlers,
	releaseCompletedOrder,
	releaseEligibleFunds,
} from "../../src/services/payouts";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const NOW = Date.parse("2026-10-03T08:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const MARKET = DEFAULT_MARKETS[0];
const CURRENCY = MARKET.currency;
const SHOP = "s-1";
const ACCOUNT = "acct_1";

const split = (orderTotal: number, commission: number) =>
	splitAmounts({
		orderTotal,
		commission,
		vatRateBps: MARKET.vatRateBps,
		protection: PAYMENT_DEFAULTS.buyerProtection,
	});

/** The ledger spec's worked order: D 43 240, commission 3 153 + VAT 607. */
const WORKED = split(47_000, 3_153);
const D = WORKED.destinationAmount;
/** A second, smaller order: D 18 400. */
const SMALL = split(20_000, 1_342);

const d = (category: LedgerCategory, amount: number): LedgerLine => ({
	category,
	debit: amount,
	credit: 0,
});
const c = (category: LedgerCategory, amount: number): LedgerLine => ({
	category,
	debit: 0,
	credit: amount,
});

interface Setup {
	payments?: Doc;
	shop?: Doc;
	extra?: Record<string, Doc[]>;
}

function seed({ payments = {}, shop = {}, extra = {} }: Setup = {}) {
	return fakePayload(
		{
			users: [{ id: "u-1", role: "user" }],
			shops: [
				{
					id: SHOP,
					name: "Akwa",
					owner: "u-1",
					status: "active",
					level: 2,
					createdAt: at(-400 * DAY),
					...shop,
				},
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
			"payout-accounts": [{ id: "pa-1", shop: SHOP, status: "active" }],
			orders: [],
			"order-events": [],
			"payout-holds": [],
			payouts: [],
			refunds: [],
			"reconciliation-mismatches": [],
			...extra,
		},
		{
			uniques: {
				"ledger-accounts": [["key"]],
				"ledger-transactions": [["idempotencyKey"]],
				payouts: [["providerTransferId"]],
			},
			globals: {
				"app-settings": {
					payments: {
						releaseModel: "provider_hold",
						minPayout: 1000,
						earlyRelease: { enabled: false },
						...payments,
					},
				},
			},
		},
	);
}

function provider() {
	return new FakeMarketplaceProvider({ accounts: [{ accountId: ACCOUNT }] });
}

type Amounts = ReturnType<typeof split>;

/** A paid protected order, its charge posted, and its `order.completed` event. */
async function paidOrder(
	payload: FakePayload,
	id: string,
	amounts: Amounts = WORKED,
	overrides: Doc = {},
): Promise<Order> {
	const order: Doc = {
		id,
		shop: SHOP,
		paymentMethod: "mobile_money",
		paymentStatus: "paid",
		status: "completed",
		amounts: { ...amounts, total: amounts.buyerTotal, currency: CURRENCY },
		settlement: { mode: "provider_split", releaseModel: "provider_hold" },
		timestamps: { deliveredAt: at(-16 * DAY), completedAt: at(-1 * HOUR) },
		createdAt: at(-20 * DAY),
		...overrides,
	};
	payload.store.orders.push(order);
	payload.store["order-events"].push(
		{ id: `${id}-delivered`, order: id, type: "order.delivered" },
		{ id: `${id}-completed`, order: id, type: "order.completed" },
	);
	await withTransaction(payload, (req) =>
		postLedger(req, {
			kind: "charge",
			occurredAt: at(-20 * DAY),
			sourceType: "webhook-event",
			sourceId: `evt-charge-${id}`,
			currency: CURRENCY,
			order: id,
			shop: SHOP,
			entries: postingFor("charge", amounts),
		}),
	);
	return order as unknown as Order;
}

const complete = (payload: FakePayload, id: string) =>
	releaseCompletedOrder(payload, { id }, { id: `${id}-completed` });

/** What Task 15 posts on `refund.created`, for a partial refund of seller part 10 000. */
async function partialRefund(
	payload: FakePayload,
	orderId: string,
	sellerPendingAvailable: number,
	commissionEarned: boolean,
) {
	payload.store.refunds.push({
		id: `r-${orderId}`,
		order: orderId,
		amount: 10_800,
		breakdown: {
			seller: 10_000,
			commission: 671,
			commissionVat: 129,
			buyerProtectionFee: 0,
		},
		reason: "withdrawal",
		status: "pending",
	});
	await withTransaction(payload, (req) =>
		postLedger(req, {
			kind: "refund_submitted",
			occurredAt: at(0),
			sourceType: "webhook-event",
			sourceId: `evt-refund-${orderId}`,
			currency: CURRENCY,
			order: orderId,
			shop: SHOP,
			refund: `r-${orderId}`,
			entries: postingFor("refund_submitted", {
				seller: 10_000,
				commission: 671,
				commissionVat: 129,
				buyerProtectionFee: 0,
				buyerProtectionFeeVat: 0,
				sellerPendingAvailable,
				commissionEarned,
			}),
		}),
	);
}

const transactions = (payload: FakePayload) =>
	(payload.store["ledger-transactions"] ??
		[]) as unknown as LedgerTransaction[];
const ofKind = (payload: FakePayload, kind: LedgerTransactionKind) =>
	transactions(payload).filter((t) => t.kind === kind);
const payouts = (payload: FakePayload) =>
	payload.store.payouts as unknown as Payout[];
const orderOf = (payload: FakePayload, id: string) =>
	payload.store.orders.find((o) => o.id === id) as unknown as Order;

/** A stored posting's lines by category. */
function linesOf(payload: FakePayload, transaction: LedgerTransaction) {
	const accounts = (payload.store["ledger-accounts"] ??
		[]) as unknown as LedgerAccount[];
	const category = new Map(accounts.map((a) => [String(a.id), a.category]));
	return transaction.entries.map((e) => ({
		category: category.get(String(e.account)),
		debit: e.debit,
		credit: e.credit,
	}));
}

const balance = (payload: FakePayload, category: LedgerCategory) =>
	accountBalance(payload, category, SHOP, CURRENCY);

function asTransfer(event: NormalisedEvent): TransferEvent {
	if (event.entity !== "transfer") throw new Error("not a transfer event");
	return event;
}

/** Scripts the payout's transfer and returns its events, in provider order. */
function transferEvents(
	fake: FakeMarketplaceProvider,
	payout: Payout,
	statuses: TransferEvent["status"][],
): TransferEvent[] {
	const reference = payoutReference(payout.id);
	fake.script(
		reference,
		statuses.map((status) => ({ entity: "transfer" as const, status })),
	);
	return fake.advanceAll(reference).map((s) => asTransfer(s.event));
}

const apply = (payload: FakePayload, event: TransferEvent) =>
	withTransaction(payload, (req) => applyTransferEvent(req, event));

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	for (const fn of Object.values(notifications)) fn.mockClear();
	invoices.issueApplicationFeeCommissionInvoice.mockReset();
	invoices.issueApplicationFeeCommissionInvoice.mockResolvedValue(undefined);
});
afterEach(() => {
	vi.useRealTimers();
});

describe("release at completed", () => {
	it("posts release D′ and commission_earned C′, sets releaseEligibleAt and hands off the invoice", async () => {
		const payload = seed();
		await paidOrder(payload, "o-1");

		const result = await complete(payload, "o-1");

		expect(result).toEqual({
			released: true,
			amount: 43_240,
			commission: 3_153,
			commissionVat: 607,
			releaseModel: "provider_hold",
		});
		const [release] = ofKind(payload, "release");
		expect(linesOf(payload, release)).toEqual([
			d("seller_pending", 43_240),
			c("seller_releasable", 43_240),
		]);
		expect(release.idempotencyKey).toBe("order-event:o-1-completed:release");
		const [earned] = ofKind(payload, "commission_earned");
		expect(linesOf(payload, earned)).toEqual([
			d("platform_fee_unearned", 3_760),
			c("platform_revenue_commission", 3_153),
			c("vat_payable", 607),
		]);
		expect(await balance(payload, "seller_pending")).toBe(0);
		expect(await balance(payload, "seller_releasable")).toBe(43_240);
		expect(orderOf(payload, "o-1").settlement?.releaseEligibleAt).toBe(at(0));
		expect(orderOf(payload, "o-1").settlement?.releasedAt).toBeUndefined();
		expect(invoices.issueApplicationFeeCommissionInvoice).toHaveBeenCalledTimes(
			1,
		);
		expect(
			invoices.issueApplicationFeeCommissionInvoice.mock.calls[0]?.[1],
		).toMatchObject({ id: "o-1" });
	});

	it("is the order.completed handler in P4's registry", async () => {
		const payload = seed();
		const order = await paidOrder(payload, "o-1");
		__resetOrderEventHandlers();
		registerPayoutHandlers();

		const event: OrderEvent = {
			id: "o-1-completed",
			order: "o-1",
			type: "order.completed",
			visibility: "both",
			createdAt: at(0),
			updatedAt: at(0),
		};
		const failed = await runOrderEventHandlers(payload, order, event);

		expect(failed).toEqual([]);
		expect(ofKind(payload, "release")).toHaveLength(1);
		expect(await balance(payload, "seller_releasable")).toBe(D);
	});

	it("a replay posts nothing more", async () => {
		const payload = seed();
		await paidOrder(payload, "o-1");
		await complete(payload, "o-1");
		const second = await complete(payload, "o-1");

		expect(second).toMatchObject({ released: true, amount: 0 });
		expect(ofKind(payload, "release")).toHaveLength(1);
		expect(ofKind(payload, "commission_earned")).toHaveLength(1);
		expect(await balance(payload, "seller_releasable")).toBe(D);
	});

	it("an invoice failure keeps the posting and the retry re-issues only the invoice", async () => {
		const payload = seed();
		await paidOrder(payload, "o-1");
		invoices.issueApplicationFeeCommissionInvoice.mockRejectedValueOnce(
			new Error("renderer down"),
		);

		await expect(complete(payload, "o-1")).rejects.toThrow("renderer down");
		expect(await balance(payload, "seller_releasable")).toBe(D);

		await complete(payload, "o-1");
		expect(invoices.issueApplicationFeeCommissionInvoice).toHaveBeenCalledTimes(
			2,
		);
		expect(ofKind(payload, "release")).toHaveLength(1);
	});

	describe("each money blocker alone stops the posting", () => {
		it("an order that is not completed", async () => {
			const payload = seed();
			await paidOrder(payload, "o-1", WORKED, { status: "delivered" });
			expect(await complete(payload, "o-1")).toEqual({
				released: false,
				blocker: "not_completed",
			});
			expect(ofKind(payload, "release")).toHaveLength(0);
			expect(await balance(payload, "seller_pending")).toBe(D);
		});

		it("no charge posting", async () => {
			const payload = seed();
			await paidOrder(payload, "o-1");
			payload.store["ledger-transactions"] = [];
			expect(await complete(payload, "o-1")).toEqual({
				released: false,
				blocker: "no_charge",
			});
			expect(ofKind(payload, "release")).toHaveLength(0);
		});

		it("an open balance_mismatch on the shop — and not a resolved one", async () => {
			const payload = seed();
			await paidOrder(payload, "o-1");
			payload.store["reconciliation-mismatches"].push(
				{
					id: "m-old",
					kind: "balance_mismatch",
					shop: SHOP,
					status: "resolved",
				},
				{ id: "m-1", kind: "balance_mismatch", shop: SHOP, status: "open" },
			);
			expect(await complete(payload, "o-1")).toEqual({
				released: false,
				blocker: "balance_mismatch",
			});
			expect(ofKind(payload, "release")).toHaveLength(0);
			expect(
				invoices.issueApplicationFeeCommissionInvoice,
			).not.toHaveBeenCalled();

			payload.store["reconciliation-mismatches"][1].status = "resolved";
			expect(await complete(payload, "o-1")).toMatchObject({
				released: true,
				amount: D,
			});
		});

		it("a cash-on-delivery order is not the handler's", async () => {
			const payload = seed();
			await paidOrder(payload, "o-1", WORKED, { paymentMethod: "cod" });
			expect(await complete(payload, "o-1")).toEqual({
				released: false,
				blocker: "not_protected",
			});
			expect(ofKind(payload, "release")).toHaveLength(0);
		});
	});

	describe("holds and suspension block the payout, never the posting", () => {
		const cases: Array<[string, (payload: FakePayload) => void]> = [
			[
				"an order hold",
				(p) =>
					p.store["payout-holds"].push({
						id: "h-1",
						scope: "order",
						shop: SHOP,
						order: "o-1",
						reason: "fraud_signal",
						status: "active",
					}),
			],
			[
				"a shop hold",
				(p) =>
					p.store["payout-holds"].push({
						id: "h-1",
						scope: "shop",
						shop: SHOP,
						reason: "payout_account_changed",
						status: "active",
					}),
			],
			[
				"a suspended shop",
				(p) => {
					p.store.shops[0].status = "suspended";
				},
			],
		];

		it.each(
			cases,
		)("%s: release posted, no payout, then paid once lifted", async (_name, block) => {
			const payload = seed();
			const fake = provider();
			await paidOrder(payload, "o-1");
			block(payload);

			expect(await complete(payload, "o-1")).toMatchObject({
				released: true,
				amount: D,
			});
			expect(await balance(payload, "seller_releasable")).toBe(D);

			const blocked = await releaseEligibleFunds(payload, new Date(NOW), {
				provider: fake,
			});
			expect(blocked.payouts).toEqual([]);
			expect(blocked.skipped).toHaveLength(1);
			expect(fake.callsTo("releasePayout")).toHaveLength(0);

			payload.store["payout-holds"] = [];
			payload.store.shops[0].status = "active";
			const lifted = await releaseEligibleFunds(payload, new Date(NOW), {
				provider: fake,
			});
			expect(lifted.payouts).toMatchObject([{ amount: D, status: "pending" }]);
			expect(fake.callsTo("releasePayout")).toEqual([
				[
					ACCOUNT,
					{
						amount: D,
						currency: CURRENCY,
						reference: payoutReference(lifted.payouts[0].payout),
					},
				],
			]);
		});
	});

	it("a partial refund before completion shrinks D′ and C′ (Review Focus 4)", async () => {
		const payload = seed();
		await paidOrder(payload, "o-1");
		await partialRefund(payload, "o-1", D, false);

		const result = await complete(payload, "o-1");

		expect(result).toMatchObject({
			released: true,
			amount: 33_240,
			commission: 2_482,
			commissionVat: 478,
		});
		expect(linesOf(payload, ofKind(payload, "release")[0])).toEqual([
			d("seller_pending", 33_240),
			c("seller_releasable", 33_240),
		]);
		expect(linesOf(payload, ofKind(payload, "commission_earned")[0])).toEqual([
			d("platform_fee_unearned", 2_960),
			c("platform_revenue_commission", 2_482),
			c("vat_payable", 478),
		]);
		expect(await balance(payload, "seller_pending")).toBe(0);
		expect(
			await accountBalance(payload, "platform_fee_unearned", null, CURRENCY),
		).toBe(0);
	});

	it("provider_schedule: release goes straight to seller_payout_in_transit", async () => {
		const payload = seed({ payments: { releaseModel: "provider_schedule" } });
		await paidOrder(payload, "o-1", WORKED, {
			settlement: { mode: "provider_split", releaseModel: "provider_schedule" },
		});

		await complete(payload, "o-1");

		expect(linesOf(payload, ofKind(payload, "release")[0])).toEqual([
			d("seller_pending", D),
			c("seller_payout_in_transit", D),
		]);
		expect(await balance(payload, "seller_releasable")).toBe(0);
		expect(orderOf(payload, "o-1").settlement?.releasedAt).toBe(at(0));
	});
});

describe("releaseEligibleFunds", () => {
	it("pays D′ net of a refund that landed after release (Review Focus 4)", async () => {
		const payload = seed();
		const fake = provider();
		await paidOrder(payload, "o-1");
		await complete(payload, "o-1");
		await partialRefund(payload, "o-1", 0, true);
		expect(await balance(payload, "seller_receivable")).toBe(10_000);

		const run = await releaseEligibleFunds(payload, new Date(NOW), {
			provider: fake,
		});

		expect(run.payouts).toMatchObject([{ amount: 33_240, status: "pending" }]);
		expect(fake.callsTo("releasePayout")[0]?.[1].amount).toBe(33_240);
		const [netting] = ofKind(payload, "clawback_recovered");
		expect(linesOf(payload, netting)).toEqual([
			d("seller_releasable", 10_000),
			c("seller_receivable", 10_000),
		]);
		expect(await balance(payload, "seller_receivable")).toBe(0);
		expect(await balance(payload, "seller_releasable")).toBe(33_240);
		const [payout] = payouts(payload);
		expect(payout).toMatchObject({
			shop: SHOP,
			connectedAccount: "ca-1",
			payoutAccount: "pa-1",
			amount: 33_240,
			currency: CURRENCY,
			orders: [{ order: "o-1", amount: 33_240 }],
			origin: "platform_release",
			status: "pending",
			providerTransferId: expect.any(String),
		});
		expect(payout.statusHistory?.map((h) => h.status)).toEqual([
			"scheduled",
			"pending",
		]);
		expect(orderOf(payload, "o-1").settlement).toMatchObject({
			payout: payout.id,
			releasedAt: at(0),
		});
	});

	it("re-checks holds inside the shop's transaction (Review Focus 3)", async () => {
		const payload = seed();
		const fake = provider();
		await paidOrder(payload, "o-1");
		await paidOrder(payload, "o-2", SMALL);
		await complete(payload, "o-1");
		await complete(payload, "o-2");

		// The hold lands after the selection query read the holds and before
		// the shop's transaction re-reads them: the same minute as the run.
		let injected = 0;
		payload.failWhen = (_method, args) => {
			const selected = payload.reads.some(
				(r) => r.collection === "payout-holds",
			);
			if (selected && args.req?.transactionID && injected === 0) {
				injected += 1;
				payload.store["payout-holds"].push({
					id: "h-race",
					scope: "order",
					shop: SHOP,
					order: "o-1",
					reason: "dispute_open",
					status: "active",
				});
			}
			return false;
		};

		const run = await releaseEligibleFunds(payload, new Date(NOW), {
			provider: fake,
		});

		expect(injected).toBe(1);
		expect(run.payouts).toMatchObject([
			{ amount: SMALL.destinationAmount, status: "pending" },
		]);
		expect(payouts(payload)[0].orders).toEqual([
			expect.objectContaining({
				order: "o-2",
				amount: SMALL.destinationAmount,
			}),
		]);
		expect(orderOf(payload, "o-1").settlement?.payout ?? null).toBeNull();
	});

	it("respects minPayout at its boundary", async () => {
		const below = seed({ payments: { minPayout: D + 1 } });
		await paidOrder(below, "o-1");
		await complete(below, "o-1");
		const skipped = await releaseEligibleFunds(below, new Date(NOW), {
			provider: provider(),
		});
		expect(skipped.payouts).toEqual([]);
		expect(skipped.skipped).toEqual([
			{ shop: SHOP, reason: "below_min_payout" },
		]);

		const at_ = seed({ payments: { minPayout: D } });
		await paidOrder(at_, "o-1");
		await complete(at_, "o-1");
		const paid = await releaseEligibleFunds(at_, new Date(NOW), {
			provider: provider(),
		});
		expect(paid.payouts).toMatchObject([{ amount: D }]);
	});

	it("never pays the same order twice across runs", async () => {
		const payload = seed();
		const fake = provider();
		await paidOrder(payload, "o-1");
		await complete(payload, "o-1");

		await releaseEligibleFunds(payload, new Date(NOW), { provider: fake });
		const second = await releaseEligibleFunds(payload, new Date(NOW + DAY), {
			provider: fake,
		});

		expect(second.payouts).toEqual([]);
		expect(payouts(payload)).toHaveLength(1);
		expect(fake.callsTo("releasePayout")).toHaveLength(1);
	});

	it("a refused releasePayout cancels the payout and frees the orders for the next run", async () => {
		const payload = seed();
		const fake = provider();
		await paidOrder(payload, "o-1");
		await complete(payload, "o-1");
		fake.failWhen("releasePayout", { times: 1 });

		const first = await releaseEligibleFunds(payload, new Date(NOW), {
			provider: fake,
		});
		expect(first.payouts).toMatchObject([{ amount: D, status: "cancelled" }]);
		expect(orderOf(payload, "o-1").settlement).toMatchObject({
			payout: null,
			releasedAt: null,
		});

		const second = await releaseEligibleFunds(payload, new Date(NOW + DAY), {
			provider: fake,
		});
		expect(second.payouts).toMatchObject([{ amount: D, status: "pending" }]);
		expect(payouts(payload).map((p) => p.status)).toEqual([
			"cancelled",
			"pending",
		]);
	});

	it("three failed payouts in a row place a hold, notify the owner, and stop a fourth attempt", async () => {
		const payload = seed();
		const fake = provider();
		await paidOrder(payload, "o-1");
		await complete(payload, "o-1");

		for (let attempt = 1; attempt <= 3; attempt++) {
			const run = await releaseEligibleFunds(
				payload,
				new Date(NOW + attempt * DAY),
				{ provider: fake },
			);
			expect(run.payouts).toMatchObject([{ amount: D, status: "pending" }]);
			const payout = payouts(payload)[attempt - 1];
			for (const event of transferEvents(fake, payout, ["failed"])) {
				await apply(payload, event);
			}
		}

		expect(payouts(payload).map((p) => p.status)).toEqual([
			"failed",
			"failed",
			"failed",
		]);
		expect(ofKind(payload, "payout_failed")).toHaveLength(3);
		expect(await balance(payload, "seller_releasable")).toBe(D);
		const holds = payload.store["payout-holds"];
		expect(holds).toMatchObject([
			{
				scope: "shop",
				shop: SHOP,
				reason: "payout_failed_repeatedly",
				status: "active",
				createdByType: "system",
			},
		]);
		expect(notifications.notifyPayoutHoldPlaced).toHaveBeenCalledTimes(1);
		expect(notifications.notifyPayoutHoldPlaced.mock.calls[0]?.[1]).toEqual({
			holdId: holds[0].id,
			scope: "shop",
			orderId: null,
			category: "operations",
			checkPayoutAccount: true,
		});
		expect(notifications.notifyPayoutFailed).toHaveBeenCalledTimes(3);

		const fourth = await releaseEligibleFunds(
			payload,
			new Date(NOW + 4 * DAY),
			{
				provider: fake,
			},
		);
		expect(fourth.payouts).toEqual([]);
		expect(fourth.skipped).toEqual([{ shop: SHOP, reason: "shop_hold" }]);
		expect(fake.callsTo("releasePayout")).toHaveLength(3);
	});

	it("an admin's release of the repeated-failure hold lets the next run pay, and the streak starts again", async () => {
		const payload = seed();
		const fake = provider();
		await paidOrder(payload, "o-1");
		await complete(payload, "o-1");
		for (let attempt = 1; attempt <= 3; attempt++) {
			await releaseEligibleFunds(payload, new Date(NOW + attempt * DAY), {
				provider: fake,
			});
			const payout = payouts(payload)[attempt - 1];
			for (const event of transferEvents(fake, payout, ["failed"])) {
				await apply(payload, event);
			}
		}
		const [hold] = payload.store["payout-holds"];

		vi.setSystemTime(NOW + 4 * DAY);
		await withTransaction(payload, (req) =>
			releaseHold(req, String(hold.id), { note: "seller fixed the number" }),
		);
		vi.setSystemTime(NOW + 5 * DAY);
		const run = await releaseEligibleFunds(payload, new Date(NOW + 5 * DAY), {
			provider: fake,
		});

		expect(run.skipped).toEqual([]);
		expect(run.payouts).toMatchObject([{ amount: D, status: "pending" }]);
		expect(fake.callsTo("releasePayout")).toHaveLength(4);
		expect(
			payload.store["payout-holds"].map((h) => [h.reason, h.status]),
		).toEqual([["payout_failed_repeatedly", "released"]]);

		// One failure after the release is one, not the fourth of a streak.
		const fourth = payouts(payload)[3];
		for (const event of transferEvents(fake, fourth, ["failed"])) {
			await apply(payload, event);
		}
		expect(
			payload.store["payout-holds"].filter((h) => h.status === "active"),
		).toHaveLength(0);
	});

	it("catches up a completed order whose release a cleared blocker held back", async () => {
		const payload = seed();
		const fake = provider();
		await paidOrder(payload, "o-1");
		payload.store["reconciliation-mismatches"].push({
			id: "m-1",
			kind: "balance_mismatch",
			shop: SHOP,
			status: "open",
		});
		expect(await complete(payload, "o-1")).toMatchObject({ released: false });

		payload.store["reconciliation-mismatches"][0].status = "resolved";
		const run = await releaseEligibleFunds(payload, new Date(NOW), {
			provider: fake,
		});

		expect(run.caughtUp).toEqual(["o-1"]);
		expect(run.payouts).toMatchObject([{ amount: D }]);
		expect(ofKind(payload, "release")[0].idempotencyKey).toBe(
			"order-event:o-1-completed:release",
		);
	});
});

describe("transfer lifecycle", () => {
	async function pendingPayout() {
		const payload = seed();
		const fake = provider();
		await paidOrder(payload, "o-1");
		await complete(payload, "o-1");
		await releaseEligibleFunds(payload, new Date(NOW), { provider: fake });
		return { payload, fake, payout: payouts(payload)[0] };
	}

	it("created then complete: submitted then complete postings, owner told", async () => {
		const { payload, fake, payout } = await pendingPayout();
		const [created, done] = transferEvents(fake, payout, [
			"pending",
			"complete",
		]);

		expect(await apply(payload, created)).toEqual({
			applied: true,
			payout: payout.id,
			status: "pending",
			changed: false,
		});
		expect(linesOf(payload, ofKind(payload, "payout_submitted")[0])).toEqual([
			d("seller_releasable", D),
			c("seller_payout_in_transit", D),
		]);
		expect(await apply(payload, done)).toMatchObject({
			status: "complete",
			changed: true,
		});
		expect(linesOf(payload, ofKind(payload, "payout_complete")[0])).toEqual([
			d("seller_payout_in_transit", D),
			c("provider_position", D),
		]);
		expect(await balance(payload, "seller_releasable")).toBe(0);
		expect(await balance(payload, "seller_payout_in_transit")).toBe(0);
		expect(notifications.notifyPayoutSent).toHaveBeenCalledTimes(1);
		expect(notifications.notifyPayoutSent.mock.calls[0]?.[1]).toEqual({
			payoutId: payout.id,
			amount: D,
			currency: CURRENCY,
		});
	});

	it("complete before created lands one terminal state and one posting of each kind", async () => {
		const { payload, fake, payout } = await pendingPayout();
		const [created, done] = transferEvents(fake, payout, [
			"pending",
			"complete",
		]);

		await apply(payload, done);
		const late = await apply(payload, created);

		expect(late).toMatchObject({ status: "complete", changed: false });
		expect(payouts(payload)[0].status).toBe("complete");
		expect(payouts(payload)[0].statusHistory?.map((h) => h.status)).toEqual([
			"scheduled",
			"pending",
			"complete",
		]);
		expect(ofKind(payload, "payout_submitted")).toHaveLength(1);
		expect(ofKind(payload, "payout_complete")).toHaveLength(1);
		expect(await balance(payload, "seller_payout_in_transit")).toBe(0);
	});

	it("the same completion under two event ids posts once", async () => {
		const { payload, fake, payout } = await pendingPayout();
		const [done] = transferEvents(fake, payout, ["complete"]);
		await apply(payload, done);
		await apply(payload, { ...done, providerEventId: "evt-dup" });

		expect(ofKind(payload, "payout_complete")).toHaveLength(1);
		expect(notifications.notifyPayoutSent).toHaveBeenCalledTimes(1);
	});

	it("failed gives the money back to seller_releasable and frees the orders", async () => {
		const { payload, fake, payout } = await pendingPayout();
		const [failed] = transferEvents(fake, payout, ["failed"]);

		await apply(payload, failed);

		expect(linesOf(payload, ofKind(payload, "payout_failed")[0])).toEqual([
			d("seller_payout_in_transit", D),
			c("seller_releasable", D),
		]);
		expect(await balance(payload, "seller_releasable")).toBe(D);
		expect(orderOf(payload, "o-1").settlement).toMatchObject({
			payout: null,
			releasedAt: null,
		});
		const late = await apply(payload, { ...failed, status: "complete" });
		expect(late).toMatchObject({ status: "failed", changed: false });
		expect(ofKind(payload, "payout_complete")).toHaveLength(0);
	});

	it("complete then reversed posts payout_reversed", async () => {
		const { payload, fake, payout } = await pendingPayout();
		const events = transferEvents(fake, payout, ["complete", "reversed"]);
		for (const event of events) await apply(payload, event);

		expect(payouts(payload)[0].status).toBe("reversed");
		// `payout_complete` already drained `seller_payout_in_transit` into
		// `provider_position`; the checkpoint ruling (not `payout_failed`'s
		// pre-completion reversal) puts the money back on both sides —
		// debiting `provider_position` (it really did come back) and
		// crediting `seller_releasable` (this payout is `platform_release`:
		// `provider_hold`, so the seller is due another attempt).
		expect(linesOf(payload, ofKind(payload, "payout_reversed")[0])).toEqual([
			d("provider_position", D),
			c("seller_releasable", D),
		]);
		// The old `payoutBack` posting drove this to -D forever; it must
		// land back at 0, the same balance `payout_complete` left it at.
		expect(await balance(payload, "seller_payout_in_transit")).toBe(0);
		expect(await balance(payload, "seller_releasable")).toBe(D);
	});

	it("provider_schedule: a provider transfer creates its own payout row, out of order too", async () => {
		const payload = seed({ payments: { releaseModel: "provider_schedule" } });
		const fake = provider();
		const base = {
			entity: "transfer" as const,
			reference: "",
			amount: 25_000,
			currency: CURRENCY,
			providerTransactionId: "tr_sched_1",
			transferId: "tr_sched_1",
			accountId: ACCOUNT,
			fee: 250,
			failureReason: null,
		};
		const done = asTransfer(fake.emit({ ...base, status: "complete" }).event);
		const created = asTransfer(fake.emit({ ...base, status: "pending" }).event);

		await apply(payload, done);
		const late = await apply(payload, created);

		expect(late).toMatchObject({ status: "complete", changed: false });
		expect(payouts(payload)).toHaveLength(1);
		expect(payouts(payload)[0]).toMatchObject({
			shop: SHOP,
			connectedAccount: "ca-1",
			amount: 25_000,
			fee: 250,
			currency: CURRENCY,
			orders: [],
			origin: "provider_schedule",
			status: "complete",
			providerTransferId: "tr_sched_1",
		});
		expect(ofKind(payload, "payout_submitted")).toHaveLength(0);
		expect(ofKind(payload, "payout_complete")).toHaveLength(1);
		expect(linesOf(payload, ofKind(payload, "payout_complete")[0])).toEqual([
			d("seller_payout_in_transit", 25_000),
			c("provider_position", 25_000),
		]);
	});

	it("leaves reseller transfers and unknown accounts alone", async () => {
		const payload = seed();
		const fake = provider();
		const base = {
			entity: "transfer" as const,
			status: "complete" as const,
			amount: 5_000,
			currency: CURRENCY,
			providerTransactionId: "tr_x",
			transferId: "tr_x",
			fee: null,
			failureReason: null,
		};
		const reseller = asTransfer(
			fake.emit({ ...base, reference: "RP-1", accountId: ACCOUNT }).event,
		);
		const stranger = asTransfer(
			fake.emit({ ...base, reference: "", accountId: "acct_unknown" }).event,
		);
		expect(await apply(payload, reseller)).toEqual({
			applied: false,
			reason: "reseller",
		});
		expect(await apply(payload, stranger)).toEqual({
			applied: false,
			reason: "unknown_account",
		});
		expect(payouts(payload)).toHaveLength(0);
		expect(transactions(payload)).toHaveLength(0);
	});
});

describe("early release (level 3)", () => {
	/** 30 completed protected orders: the minimum the rule asks for. */
	function history(count: number): Doc[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `h-${i}`,
			shop: SHOP,
			paymentMethod: "mobile_money",
			paymentStatus: "paid",
			status: "completed",
			createdAt: at(-200 * DAY),
		}));
	}

	async function delivered(enabled: boolean, deliveredAgo: number) {
		const payload = seed({
			payments: { earlyRelease: { enabled } },
			shop: { level: 3 },
			extra: { orders: history(30) },
		});
		await paidOrder(payload, "o-1", WORKED, {
			status: "delivered",
			timestamps: { deliveredAt: at(-deliveredAgo) },
		});
		return payload;
	}

	it("releases exactly 70% of D 48 h after delivery and the rest at completed", async () => {
		const payload = await delivered(true, 48 * HOUR);
		const fake = provider();

		const first = await releaseEligibleFunds(payload, new Date(NOW), {
			provider: fake,
		});
		expect(first.early).toEqual(["o-1"]);
		expect(linesOf(payload, ofKind(payload, "release")[0])).toEqual([
			d("seller_pending", 30_268),
			c("seller_releasable", 30_268),
		]);
		expect(first.payouts).toMatchObject([{ amount: 30_268 }]);
		expect(orderOf(payload, "o-1").settlement?.releasedAt).toBeUndefined();

		orderOf(payload, "o-1").status = "completed";
		expect(await complete(payload, "o-1")).toMatchObject({ amount: 12_972 });
		const second = await releaseEligibleFunds(payload, new Date(NOW + DAY), {
			provider: fake,
		});
		expect(second.early).toEqual([]);
		expect(second.payouts).toMatchObject([{ amount: 12_972 }]);
		expect(fake.callsTo("releasePayout").map(([, p]) => p.amount)).toEqual([
			30_268, 12_972,
		]);
		expect(30_268 + 12_972).toBe(D);
	});

	it("waits the full 48 hours", async () => {
		const payload = await delivered(true, 48 * HOUR - 60_000);
		const run = await releaseEligibleFunds(payload, new Date(NOW), {
			provider: provider(),
		});
		expect(run.early).toEqual([]);
		expect(ofKind(payload, "release")).toHaveLength(0);
	});

	it("does nothing with the flag off (the default)", async () => {
		const payload = await delivered(false, 72 * HOUR);
		const run = await releaseEligibleFunds(payload, new Date(NOW), {
			provider: provider(),
		});
		expect(run.early).toEqual([]);
		expect(run.payouts).toEqual([]);
		expect(await balance(payload, "seller_pending")).toBe(D);
	});

	it("earlyReleaseAmount is 70% of D, capped by what is still pending", () => {
		expect(earlyReleaseAmount(D, D)).toBe(30_268);
		expect(earlyReleaseAmount(D, 20_000)).toBe(20_000);
	});

	const shop3 = { status: "active", level: 3 };
	const ok = { completedProtectedOrders: 30, disputeLossRate: 0.0199 };
	it.each([
		["level 3", shop3, ok, true],
		["level 2", { status: "active", level: 2 }, ok, false],
		["30 completed", shop3, { ...ok, completedProtectedOrders: 30 }, true],
		["29 completed", shop3, { ...ok, completedProtectedOrders: 29 }, false],
		["1.99% loss", shop3, { ...ok, disputeLossRate: 0.0199 }, true],
		["2% loss", shop3, { ...ok, disputeLossRate: 0.02 }, false],
	])("gate at its boundary: %s", (_name, shop, stats, expected) => {
		expect(earlyReleaseEligible(shop, stats, new Date(NOW))).toBe(expected);
	});

	it("measures the dispute loss rate over 90 days of protected orders", async () => {
		const orders = Array.from({ length: 50 }, (_, i) => ({
			id: `w-${i}`,
			shop: SHOP,
			paymentMethod: "mobile_money",
			paymentStatus: "paid",
			status: "completed",
			createdAt: at(-10 * DAY),
		}));
		const payload = seed({
			extra: {
				orders: [
					...orders,
					{ ...orders[0], id: "old", createdAt: at(-91 * DAY) },
				],
				refunds: [
					{ id: "r-1", order: "w-0", reason: "dispute", status: "succeeded" },
					{ id: "r-2", order: "w-1", reason: "dispute", status: "failed" },
					{
						id: "r-3",
						order: "w-2",
						reason: "withdrawal",
						status: "succeeded",
					},
					{ id: "r-4", order: "old", reason: "dispute", status: "succeeded" },
				],
			},
		});
		expect(await earlyReleaseStats(payload, SHOP, new Date(NOW))).toEqual({
			completedProtectedOrders: 51,
			disputeLossRate: 0.02,
		});
	});
});

describe("providerScheduleEligible (the fallback's no-reserve arm)", () => {
	const now = new Date(NOW);
	const aged = (days: number) => ({ createdAt: at(-days * DAY) });
	const ok = { completedCodOrders: 10, codLossRate: 0.049 };

	it.each([
		["59 days", aged(59), ok, ["shop_too_young"]],
		["60 days", aged(60), ok, []],
		[
			"9 COD orders",
			aged(60),
			{ ...ok, completedCodOrders: 9 },
			["too_few_cod_orders"],
		],
		["10 COD orders", aged(60), { ...ok, completedCodOrders: 10 }, []],
		["5% loss", aged(60), { ...ok, codLossRate: 0.05 }, ["loss_rate_too_high"]],
		["4.9% loss", aged(60), { ...ok, codLossRate: 0.049 }, []],
	])("%s", (_name, shop, stats, refusals) => {
		expect(providerScheduleRefusals(shop, stats, now)).toEqual(refusals);
		expect(providerScheduleEligible(shop, stats, now)).toBe(
			refusals.length === 0,
		);
	});

	it("reads its stats from the shop's COD orders", async () => {
		const cod = (id: string, extra: Doc) => ({
			id,
			shop: SHOP,
			paymentMethod: "cod",
			...extra,
		});
		const payload = seed({
			extra: {
				orders: [
					...Array.from({ length: 18 }, (_, i) =>
						cod(`c-${i}`, {
							status: "completed",
							paymentStatus: "cod_collected",
						}),
					),
					cod("refused", {
						status: "delivery_failed",
						paymentStatus: "cod_refused",
					}),
					cod("returned", {
						status: "returned",
						paymentStatus: "cod_collected",
					}),
					cod("open", { status: "shipped", paymentStatus: "cod_pending" }),
				],
			},
		});
		expect(await providerScheduleStats(payload, SHOP)).toEqual({
			completedCodOrders: 18,
			codLossRate: 0.1,
		});
	});

	it("halves the exposure caps under provider_schedule", () => {
		const caps = PAYMENT_DEFAULTS.exposureCaps;
		expect(
			exposureCap({ exposureCaps: caps, releaseModel: "provider_hold" }, 2),
		).toBe(500_000);
		expect(
			exposureCap({ exposureCaps: caps, releaseModel: "provider_schedule" }, 2),
		).toBe(250_000);
		expect(
			exposureCap({ exposureCaps: caps, releaseModel: "provider_schedule" }, 3),
		).toBe(1_000_000);
	});
});
