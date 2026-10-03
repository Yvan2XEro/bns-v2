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

/**
 * The seller payments view, through its two routes, over a ledger built by
 * the real services: charges posted, `release` at completion, the payout
 * batch, the provider's transfer events. Only the notices, the commission
 * invoice and `getPayload` are doubled.
 */
const { getPayloadMock, notifications, invoices } = vi.hoisted(() => ({
	getPayloadMock: vi.fn(),
	notifications: {
		notifyPayoutHoldReleased: vi.fn(async () => {}),
		notifyPayoutSent: vi.fn(async () => {}),
		notifyPayoutFailed: vi.fn(async () => {}),
		notifyPayoutHoldPlaced: vi.fn(async () => {}),
	},
	invoices: {
		issueApplicationFeeCommissionInvoice: vi.fn(async () => {}),
	},
}));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
vi.mock("../../src/services/paymentNotifications", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/paymentNotifications")
	>()),
	...notifications,
}));
vi.mock("../../src/services/buyerFeeInvoices", () => invoices);

import { GET as getPayout } from "../../src/app/(frontend)/api/shops/[id]/payments/payouts/[payoutId]/route";
import { GET as getView } from "../../src/app/(frontend)/api/shops/[id]/payments/route";
import { ERROR_CODES } from "../../src/lib/errors";
import { splitAmounts } from "../../src/lib/paymentMath";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
} from "../../src/lib/paymentSettings";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import type { TransferEvent } from "../../src/lib/payments/marketplace";
import { requireUser } from "../../src/lib/shopRoute";
import { withTransaction } from "../../src/lib/transactions";
import type { Payout } from "../../src/payload-types";
import { postingFor, postLedger } from "../../src/services/ledger";
import {
	applyTransferEvent,
	payoutReference,
	releaseCompletedOrder,
	releaseEligibleFunds,
} from "../../src/services/payouts";
import type { SellerPaymentsView } from "../../src/services/sellerPayments";
import type { ServiceUser } from "../../src/services/shops";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const NOW = Date.parse("2026-10-03T08:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const MARKET = DEFAULT_MARKETS[0];
const CURRENCY = MARKET.currency;
const SHOP = "s-1";
const OTHER_SHOP = "s-2";
const ACCOUNT = "acct_1";
const OWNER = "u-owner";
const MANAGER = "u-manager";
const SHOP_STAFF = "u-staff";
const MODERATOR = "u-mod";
const STRANGER = "u-stranger";
const MASKED = "******4567";

const split = (orderTotal: number, commission: number) => ({
	orderTotal,
	...splitAmounts({
		orderTotal,
		commission,
		vatRateBps: MARKET.vatRateBps,
		protection: PAYMENT_DEFAULTS.buyerProtection,
	}),
});
type Amounts = ReturnType<typeof split>;

/** D 43 240 (commission 3 153 + VAT 607). */
const WORKED = split(47_000, 3_153);
/** D 18 400 (1 342 + 258). */
const SMALL = split(20_000, 1_342);
/** D 22 999 (1 678 + 323). */
const MID = split(25_000, 1_678);
/** D 55 199 (4 026 + 775). */
const BIG = split(60_000, 4_026);
const DELIVERY_FEE = 2_000;

let payload: FakePayload;
let fake: FakeMarketplaceProvider;

function seed(payments: Doc = {}): FakePayload {
	return fakePayload(
		{
			users: [OWNER, MANAGER, SHOP_STAFF, STRANGER, MODERATOR].map((id) => ({
				id,
				role: id === MODERATOR ? "moderator" : "user",
			})),
			shops: [
				{
					id: SHOP,
					name: "Akwa",
					owner: OWNER,
					status: "active",
					level: 2,
					location: { countryCode: "CM" },
					createdAt: at(-400 * DAY),
				},
				{ id: OTHER_SHOP, name: "Bonaberi", owner: STRANGER, status: "active" },
			],
			"shop-members": [
				[OWNER, "owner"],
				[MANAGER, "manager"],
				[SHOP_STAFF, "staff"],
			].map(([user, role]) => ({
				id: `m-${user}`,
				shop: SHOP,
				user,
				role,
				status: "active",
			})),
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
			"payout-accounts": [
				{
					id: "pa-1",
					shop: SHOP,
					status: "active",
					accountNumberMasked: MASKED,
				},
			],
			orders: [],
			"order-events": [],
			"payout-holds": [],
			payouts: [],
			refunds: [],
			"reconciliation-mismatches": [],
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

/** A paid protected order and its charge, posted as settlement posts it. */
async function paidOrder(
	id: string,
	amounts: Amounts,
	createdAt: string,
	overrides: Doc = {},
): Promise<void> {
	payload.store.orders.push({
		id,
		orderNumber: `BNS-2610-00000${id.slice(2)}`,
		shop: SHOP,
		paymentMethod: "mobile_money",
		paymentStatus: "paid",
		status: "completed",
		amounts: {
			subtotal: amounts.orderTotal - DELIVERY_FEE,
			deliveryFee: DELIVERY_FEE,
			discount: 0,
			total: amounts.buyerTotal,
			currency: CURRENCY,
			buyerProtectionFee: amounts.buyerProtectionFee,
			buyerProtectionFeeVat: amounts.buyerProtectionFeeVat,
			commission: amounts.commission,
			commissionVat: amounts.commissionVat,
			applicationFee: amounts.applicationFee,
			destinationAmount: amounts.destinationAmount,
		},
		settlement: { mode: "provider_split", releaseModel: "provider_hold" },
		deadlines: {},
		timestamps: {},
		createdAt,
		...overrides,
	});
	payload.store["order-events"].push({
		id: `${id}-completed`,
		order: id,
		type: "order.completed",
	});
	await withTransaction(payload, (req) =>
		postLedger(req, {
			kind: "charge",
			occurredAt: createdAt,
			sourceType: "webhook-event",
			sourceId: `evt-charge-${id}`,
			currency: CURRENCY,
			order: id,
			shop: SHOP,
			entries: postingFor("charge", amounts),
		}),
	);
}

const complete = (id: string) =>
	releaseCompletedOrder(payload, { id }, { id: `${id}-completed` });

const payoutsOf = () => payload.store.payouts as unknown as Payout[];

/** Delivers the provider's transfer events for a payout, in order. */
async function transfer(
	payoutId: string,
	statuses: TransferEvent["status"][],
): Promise<void> {
	const reference = payoutReference(payoutId);
	fake.script(
		reference,
		statuses.map((status) => ({ entity: "transfer" as const, status })),
	);
	for (const step of fake.advanceAll(reference)) {
		if (step.event.entity !== "transfer") throw new Error("not a transfer");
		const event = step.event;
		await withTransaction(payload, (req) => applyTransferEvent(req, event));
	}
}

/** Runs the batch, which must create exactly one payout, and submits it. */
async function payOut(): Promise<string> {
	const run = await releaseEligibleFunds(payload, new Date(), {
		provider: fake,
	});
	expect(run.payouts).toHaveLength(1);
	const payoutId = run.payouts[0].payout;
	await transfer(payoutId, ["pending"]);
	return payoutId;
}

/**
 * Seven orders, one per place a seller's money can be:
 * o-1 paid out on 30 September (23:30 in Douala), o-2 paid out at 00:30 on
 * 1 October in Douala, o-3 in a payout still in transit, o-4 released and
 * waiting for the batch, o-5 released under an order hold, o-6 delivered and
 * inside its withdrawal window with a seller-borne provider fee, o-7 accepted with a 10 000 refund already
 * taken from its pending money.
 */
async function sevenOrders(): Promise<Record<string, string>> {
	const times: Record<string, string> = {};
	vi.setSystemTime(Date.parse("2026-09-30T20:00:00.000Z"));
	await paidOrder("o-1", WORKED, at(-20 * DAY));
	await complete("o-1");
	times["o-1"] = new Date().toISOString();
	const first = await payOut();
	vi.setSystemTime(Date.parse("2026-09-30T22:30:00.000Z"));
	await transfer(first, ["complete"]);

	vi.setSystemTime(Date.parse("2026-09-30T23:00:00.000Z"));
	await paidOrder("o-2", MID, at(-19 * DAY));
	await complete("o-2");
	times["o-2"] = new Date().toISOString();
	const second = await payOut();
	vi.setSystemTime(Date.parse("2026-09-30T23:30:00.000Z"));
	await transfer(second, ["complete"]);

	vi.setSystemTime(NOW);
	await paidOrder("o-3", SMALL, at(-18 * DAY));
	await complete("o-3");
	times["o-3"] = new Date().toISOString();
	await payOut();

	await paidOrder("o-4", WORKED, at(-17 * DAY));
	await complete("o-4");
	await paidOrder("o-5", SMALL, at(-16 * DAY));
	await complete("o-5");
	times["o-4"] = times["o-5"] = new Date().toISOString();
	payload.store["payout-holds"].push({
		id: "h-1",
		scope: "order",
		shop: SHOP,
		order: "o-5",
		reason: "fraud_signal",
		status: "active",
		until: at(3 * DAY),
		createdAt: at(-1 * HOUR),
	});

	await paidOrder("o-6", BIG, at(-15 * DAY), {
		status: "delivered",
		timestamps: { deliveredAt: at(-2 * DAY) },
		deadlines: { withdrawalUntil: at(13 * DAY) },
	});
	// A seller-borne provider fee: the order's own figures never see it.
	await withTransaction(payload, (req) =>
		postLedger(req, {
			kind: "provider_fee",
			occurredAt: at(-15 * DAY),
			sourceType: "webhook-event",
			sourceId: "evt-fee-o-6",
			currency: CURRENCY,
			order: "o-6",
			shop: SHOP,
			entries: postingFor("provider_fee", { fee: 500, bearer: "seller" }),
		}),
	);
	await paidOrder("o-7", WORKED, at(-14 * DAY), {
		status: "accepted",
		paymentStatus: "partially_refunded",
	});
	await withTransaction(payload, (req) =>
		postLedger(req, {
			kind: "refund_submitted",
			occurredAt: at(-1 * HOUR),
			sourceType: "webhook-event",
			sourceId: "evt-refund-o-7",
			currency: CURRENCY,
			order: "o-7",
			shop: SHOP,
			entries: postingFor("refund_submitted", {
				seller: 10_000,
				commission: 671,
				commissionVat: 129,
				buyerProtectionFee: 0,
				buyerProtectionFeeVat: 0,
				sellerPendingAvailable: WORKED.destinationAmount,
				commissionEarned: false,
			}),
		}),
	);
	return times;
}

const asUser = (id: string): ServiceUser => ({
	id,
	role: id === MODERATOR ? "moderator" : "user",
	name: null,
	email: `${id}@test.cm`,
	suspendedAt: null,
	suspendedUntil: null,
});

async function view(userId: string | null = OWNER, shop = SHOP) {
	payload.auth.mockResolvedValue({ user: userId ? asUser(userId) : null });
	return getView(new Request(`http://x/api/shops/${shop}/payments`), {
		params: Promise.resolve({ id: shop }),
	});
}

async function payoutDetail(payoutId: string, userId = OWNER, shop = SHOP) {
	payload.auth.mockResolvedValue({ user: asUser(userId) });
	return getPayout(
		new Request(`http://x/api/shops/${shop}/payments/payouts/${payoutId}`),
		{ params: Promise.resolve({ id: shop, payoutId }) },
	);
}

const row = (
	id: string,
	amounts: Amounts,
	netToYou: number,
	status: string,
	releaseDate: string | null,
) => ({
	orderId: id,
	orderNumber: `BNS-2610-00000${id.slice(2)}`,
	goods: amounts.orderTotal - DELIVERY_FEE,
	delivery: DELIVERY_FEE,
	commissionHt: amounts.commission,
	vat: amounts.commissionVat,
	netToYou,
	status,
	releaseDate,
});

beforeAll(async () => {
	getPayloadMock.mockResolvedValue(fakePayload());
	await requireUser(new Request("http://x"));
}, 60_000);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	payload = seed();
	getPayloadMock.mockResolvedValue(payload);
	fake = new FakeMarketplaceProvider({ accounts: [{ accountId: ACCOUNT }] });
});
afterEach(() => {
	vi.useRealTimers();
});

describe("GET /api/shops/{id}/payments", () => {
	it("pins the split figures the fixture is built on", () => {
		expect(
			[WORKED, SMALL, MID, BIG].map((a) => [
				a.destinationAmount,
				a.commission,
				a.commissionVat,
			]),
		).toEqual([
			[43_240, 3_153, 607],
			[18_400, 1_342, 258],
			[22_999, 1_678, 323],
			[55_199, 4_026, 775],
		]);
	});

	it("serves the whole view from the ledger, with a held order's money kept out of Ready for payout", async () => {
		const times = await sevenOrders();
		const [third, second, first] = [...payoutsOf()].sort((a, b) =>
			b.createdAt.localeCompare(a.createdAt),
		);

		const res = await view(OWNER);

		expect(res.status).toBe(200);
		const expected: SellerPaymentsView = {
			amounts: {
				// o-7's 43 240 less the 10 000 its refund took from pending.
				awaitingDelivery: 33_240,
				// o-6's 55 199 less its 500 seller-borne fee.
				inWithdrawalPeriod: 54_699,
				// o-4 alone: o-5's 18 400 sits in seller_releasable under its hold.
				readyForPayout: 43_240,
				payoutInTransit: 18_400,
				// o-2 only: o-1 completed at 23:30 on 30 September in Douala.
				paidThisMonth: 22_999,
				currency: "XAF",
			},
			payouts: [
				{
					id: third.id,
					date: third.createdAt,
					amount: 18_400,
					fee: 0,
					destinationMasked: MASKED,
					status: "pending",
				},
				{
					id: second.id,
					date: second.createdAt,
					amount: 22_999,
					fee: 0,
					destinationMasked: MASKED,
					status: "complete",
				},
				{
					id: first.id,
					date: first.createdAt,
					amount: 43_240,
					fee: 0,
					destinationMasked: MASKED,
					status: "complete",
				},
			],
			orders: [
				row("o-7", WORKED, 33_240, "accepted", null),
				row("o-6", BIG, 54_699, "delivered", at(13 * DAY)),
				row("o-5", SMALL, 18_400, "completed", times["o-5"]),
				row("o-4", WORKED, 43_240, "completed", times["o-4"]),
				row("o-3", SMALL, 18_400, "completed", times["o-3"]),
				row("o-2", MID, 22_999, "completed", times["o-2"]),
				row("o-1", WORKED, 43_240, "completed", times["o-1"]),
			],
			holds: [
				{ scope: "order", reasonCategory: "security", until: at(3 * DAY) },
			],
		};
		expect(await res.json()).toEqual(expected);
		expect([third, second, first].map((p) => p.createdAt.slice(0, 16))).toEqual(
			["2026-10-03T08:00", "2026-09-30T23:00", "2026-09-30T20:00"],
		);
	});

	it("names the hold's category and never its rule", async () => {
		await sevenOrders();

		const text = await (await view(OWNER)).text();

		expect(text).toContain('"reasonCategory":"security"');
		expect(text).not.toContain("fraud_signal");
	});

	it.each([
		[
			"a shop hold",
			() => {
				payload.store["payout-holds"].push({
					id: "h-2",
					scope: "shop",
					shop: SHOP,
					reason: "payout_failed_repeatedly",
					status: "active",
					until: null,
					createdAt: at(0),
				});
			},
		],
		[
			"a suspended shop",
			() => {
				payload.store.shops[0].status = "suspended";
			},
		],
	] as const)("shows nothing ready under %s, the money still counted where it is", async (_label, block) => {
		await paidOrder("o-4", WORKED, at(-17 * DAY));
		await complete("o-4");
		block();

		const { amounts } = (await (
			await view(MODERATOR)
		).json()) as SellerPaymentsView;

		expect(amounts).toEqual({
			awaitingDelivery: 0,
			inWithdrawalPeriod: 0,
			readyForPayout: 0,
			payoutInTransit: 0,
			paidThisMonth: 0,
			currency: "XAF",
		});
		// The same order with the block lifted is ready: the zero above is the block's.
		payload.store["payout-holds"] = [];
		payload.store.shops[0].status = "active";
		const lifted = (await (await view(MODERATOR)).json()) as SellerPaymentsView;
		expect(lifted.amounts.readyForPayout).toBe(43_240);
	});

	it("answers null for Ready for payout under the provider's own schedule", async () => {
		payload = seed({ releaseModel: "provider_schedule" });
		getPayloadMock.mockResolvedValue(payload);
		await paidOrder("o-1", WORKED, at(-17 * DAY), {
			settlement: { mode: "provider_split", releaseModel: "provider_schedule" },
		});
		await complete("o-1");

		const { amounts } = (await (
			await view(OWNER)
		).json()) as SellerPaymentsView;

		expect(amounts).toEqual({
			awaitingDelivery: 0,
			inWithdrawalPeriod: 0,
			readyForPayout: null,
			payoutInTransit: 43_240,
			paidThisMonth: 0,
			currency: "XAF",
		});
	});

	it.each([OWNER, MANAGER, MODERATOR])("serves %s", async (userId) => {
		const res = await view(userId);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			amounts: {
				awaitingDelivery: 0,
				inWithdrawalPeriod: 0,
				readyForPayout: 0,
				payoutInTransit: 0,
				paidThisMonth: 0,
				currency: "XAF",
			},
			payouts: [],
			orders: [],
			holds: [],
		});
	});

	it.each([
		[SHOP_STAFF, 403, ERROR_CODES.shopForbidden],
		[STRANGER, 404, ERROR_CODES.shopNotFound],
		[null, 401, ERROR_CODES.unauthorized],
	] as const)("refuses %s", async (userId, status, code) => {
		const res = await view(userId);

		expect(res.status).toBe(status);
		expect((await res.json()).code).toBe(code);
	});
});

describe("GET /api/shops/{id}/payments/payouts/{payoutId}", () => {
	it("serves the payout with its orders and its status history", async () => {
		await sevenOrders();
		const second = payoutsOf().find((p) => p.amount === 22_999);
		if (!second) throw new Error("payout missing");

		const res = await payoutDetail(second.id, MANAGER);

		expect(res.status).toBe(200);
		expect(second.createdAt.slice(0, 16)).toBe("2026-09-30T23:00");
		expect(await res.json()).toEqual({
			id: second.id,
			date: second.createdAt,
			amount: 22_999,
			fee: 0,
			destinationMasked: MASKED,
			status: "complete",
			currency: "XAF",
			orders: [
				{ orderId: "o-2", orderNumber: "BNS-2610-000002", amount: 22_999 },
			],
			statusHistory: [
				{ status: "scheduled", at: "2026-09-30T23:00:00.000Z" },
				{ status: "pending", at: "2026-09-30T23:00:00.000Z" },
				{ status: "complete", at: "2026-09-30T23:30:00.000Z" },
			],
		});
	});

	it("answers another shop's payout exactly like a missing one", async () => {
		payload.store.payouts.push({
			id: "po-other",
			shop: OTHER_SHOP,
			amount: 5_000,
			currency: CURRENCY,
			origin: "platform_release",
			status: "complete",
			createdAt: at(0),
		});

		const other = await payoutDetail("po-other");
		const missing = await payoutDetail("po-missing");

		expect([other.status, (await other.json()).code]).toEqual([
			404,
			ERROR_CODES.notFound,
		]);
		expect([missing.status, (await missing.json()).code]).toEqual([
			404,
			ERROR_CODES.notFound,
		]);
		// The same row is served to its own shop's owner: the 404 is the scoping.
		payload.store.payouts[0].shop = SHOP;
		expect((await payoutDetail("po-other")).status).toBe(200);
	});

	it("refuses a shop staff member with shop.forbidden", async () => {
		const res = await payoutDetail("po-missing", SHOP_STAFF);

		expect(res.status).toBe(403);
		expect((await res.json()).code).toBe(ERROR_CODES.shopForbidden);
	});
});
