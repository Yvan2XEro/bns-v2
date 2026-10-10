// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
 * The staging rehearsal (Task 30): the fake-provider pass through the real
 * routes and services, end to end, then seven clean reconciliation nights
 * and one tampered one. This is the LOCAL stand-in the brief asks for — the
 * real staging pass against a real sandbox, and its seven real nights,
 * remain the user's own exit criterion (see the release record).
 *
 * Three leaf seams are mocked, same as every other P5 int spec: SMS, push/
 * Novu dispatch and the search queue never need to reach anything real, and
 * the invoice renderers are heavy enough that every ledger/payout spec in
 * this suite already stubs them.
 */
const { sendSms } = vi.hoisted(() => ({
	sendSms: vi.fn(async (_p: unknown, _n: unknown) => ({ status: "sent" })),
}));
vi.mock("../../src/services/smsProvider", () => ({ sendSms }));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async () => undefined),
	hasPushCredential: vi.fn(async () => false),
}));
vi.mock("../../src/hooks/searchEvents", () => ({
	queueSearchEvent: vi.fn(async () => undefined),
}));
const invoices = vi.hoisted(() => ({
	issueBuyerFeeInvoice: vi.fn(async () => undefined),
	issueApplicationFeeCommissionInvoice: vi.fn(async () => undefined),
}));
vi.mock("../../src/services/buyerFeeInvoices", () => invoices);

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

// Loads `src/jobs` the way `payload.config.ts` does: every handler module
// that self-registers on import (`registerPayoutHandlers` in
// `services/payouts.ts`, `registerCheckoutSettlementHandlers` in
// `services/checkoutSettlement.ts`) runs its registration exactly once, the
// same as production boot — see `order-event-registry-boot.int.spec.ts`.
import "../../src/jobs";

import { Markets, marketRefusal } from "../../src/collections/Markets";
import { formatMoney } from "../../src/contracts/money";
import { AppSettings } from "../../src/globals/AppSettings";
import { completeOrders } from "../../src/jobs/completeOrders";
import {
	LAUNCH_CITIES,
	LAUNCH_CITY_KEYS,
	launchCitySeedRows,
} from "../../src/lib/launchCities";
import { invalidateMarketCache } from "../../src/lib/marketCache";
import { getMarketCities } from "../../src/lib/marketCities";
import { getMarket, getMarkets } from "../../src/lib/markets";
import { formatXaf } from "../../src/lib/orderFormat";
import { splitAmounts } from "../../src/lib/paymentMath";
import {
	DEFAULT_MARKETS,
	getPaymentSettings,
	PAYMENT_DEFAULTS,
} from "../../src/lib/paymentSettings";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import {
	registerMarketplaceProvider,
	sharedFakeMarketplace,
} from "../../src/lib/payments/marketplaceRegistry";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { requireUser } from "../../src/lib/shopRoute";
import { withTransaction } from "../../src/lib/transactions";
import { migrateP10Markets } from "../../src/migrations/p10Markets";
import type { Order, PaymentIntent } from "../../src/payload-types";
import { addCartItem } from "../../src/services/cart";
import {
	type CheckoutPlaceInput,
	DELIVERY_PHONE_PATTERN,
	placeCheckoutResponse,
	placeOrder,
	quoteCheckout,
	quoteCheckoutResponse,
} from "../../src/services/checkout";
import { readCheckoutGroup } from "../../src/services/checkoutGroup";
import { createCheckoutIntent } from "../../src/services/checkoutPayment";
import type {
	SplitPlaceResponse,
	SplitQuoteView,
} from "../../src/services/checkoutSplit";
import {
	accountBalance,
	ledgerIntegrity,
	postingFor,
	postLedger,
} from "../../src/services/ledger";
import { acceptOrder, shipOrder } from "../../src/services/orders/acceptance";
import { markDelivered } from "../../src/services/orders/delivery";
import { submitPayoutAccount } from "../../src/services/payoutAccounts";
import { expirePayoutHolds } from "../../src/services/payoutHolds";
import {
	payoutReference,
	releaseEligibleFunds,
} from "../../src/services/payouts";
import {
	reconciliationWindow,
	runReconciliation,
} from "../../src/services/reconciliation";
import { processWebhookEvent } from "../../src/services/webhookEvents";
import { withRawMongo } from "./helpers/fakeMongo";
import {
	cmMarketRow,
	type Doc,
	type FakePayload,
	fakePayload,
} from "./helpers/fakePayload";

const { POST: onboardingPOST } = await import(
	"../../src/app/(frontend)/api/shops/[id]/payments/onboarding/route"
);
const { POST: marketplaceWebhookPOST } = await import(
	"../../src/app/(frontend)/api/public/payments/webhook/notchpay/route"
);

const NOW = new Date("2026-10-03T08:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const SHOP = "s-1";
const OWNER = {
	id: "u-owner",
	role: "user" as const,
	name: "Aicha",
	email: "owner@test.cm",
	suspendedAt: null,
	suspendedUntil: null,
};
const BUYER = {
	id: "u-buyer",
	role: "user" as const,
	name: "Buyer",
	email: "buyer@test.cm",
	suspendedAt: null,
	suspendedUntil: null,
};
const BUYER_PHONE = "+237670000001";
const OWNER_PHONE = "+237671234421";

/** Six evidence rows, one per gate G1-G6 (provider_hold's own G3 included). */
const GATES = ["G1", "G2", "G3", "G4", "G5", "G6"].map((gate) => ({
	gate,
	clearedAt: "2026-09-30T00:00:00.000Z",
	clearedBy: "admin",
	evidence: `ev-${gate}`,
	note: null,
}));

/** Staging's payments config: the flag open, the launch market enabled, every gate cleared. */
const STAGING_PAYMENTS = {
	protectedPayment: { enabled: true },
	releaseModel: "provider_hold" as const,
	markets: [
		{
			countryCode: "CM",
			currency: "XAF",
			provider: "notchpay" as const,
			settlementMode: "provider_split" as const,
			channels: ["cm.mtn", "cm.orange"] as const,
			vatRateBps: 1925,
			enabled: true,
		},
	],
	gates: GATES,
};

const STAGING_ORDERS = {
	enabled: true,
	launchCities: [{ key: "douala", deliveryFee: 2_000 }],
	termsVersion: "2026-09",
	pilotShopIds: [],
	vatRateBps: 1925,
};

/**
 * Runs every `AppSettings.hooks.beforeChange` hook in order, the way Payload
 * runs them on a real save — the exact helper `payment-settings.int.spec.ts`
 * uses, so this proves the staging config is accepted by the real gate,
 * not merely assumed.
 */
function savesCleanly(
	payments: Record<string, unknown>,
	orders: Record<string, unknown>,
) {
	type Hook = (args: { data: Doc; originalDoc?: Doc }) => Doc;
	let data: Doc = { payments, orders };
	for (const hook of (AppSettings.hooks?.beforeChange ??
		[]) as unknown as Hook[]) {
		data = hook({
			data,
			originalDoc: { orders: { vatRateBps: 1925 }, payments: {} },
		});
	}
	return data;
}

function world(): FakePayload {
	return fakePayload(
		{
			// P10 ships whole: the deployable world always has the CM market
			// migrated into the registry, and checkout resolves through it.
			markets: [cmMarketRow()],
			users: [
				{
					...OWNER,
					phone: OWNER_PHONE,
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
					identityVerifiedAt: "2026-09-01T00:00:00.000Z",
					identityVerification: "vr-1",
				},
				{
					...BUYER,
					phone: BUYER_PHONE,
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
				},
			],
			"verification-requests": [
				{
					id: "vr-1",
					shop: SHOP,
					submittedBy: OWNER.id,
					requestedLevel: 2,
					status: "approved",
					expiresAt: "2027-09-01T00:00:00.000Z",
					kyc: { givenNames: "Aicha Ngo", familyName: "Mbappe" },
				},
			],
			shops: [
				{
					id: SHOP,
					name: "Chez Aicha",
					handle: "chez-aicha",
					owner: OWNER.id,
					status: "active",
					level: 2,
					levelExpiresAt: null,
					ordersRestrictedAt: null,
					location: { city: "douala", countryCode: "CM" },
					contact: { phone: "+237690000000" },
					orderSettings: {
						codEnabled: true,
						sellerDeliveryEnabled: true,
						deliveryFee: null,
						deliveryEtaText: "24-48h",
						pickupEnabled: false,
						salesTermsExtra: null,
					},
				},
			],
			"shop-members": [
				{
					id: "sm-1",
					shop: SHOP,
					user: OWNER.id,
					status: "active",
					role: "owner",
				},
			],
			products: [
				{
					id: "p-1",
					shop: SHOP,
					title: "AirPods",
					status: "active",
					delivery: { codAllowed: true },
					returnPolicy: "30 jours",
				},
			],
			listings: [
				{
					id: "l-1",
					title: "AirPods Pro",
					status: "published",
					shop: SHOP,
					product: "p-1",
					condition: "new",
					category: "cat-1",
				},
			],
			categories: [{ id: "cat-1", name: "Audio" }],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: SHOP,
					sku: "AP-1",
					price: 10_000,
					trackInventory: true,
					stockOnHand: 5,
					stockReserved: 0,
					archivedAt: null,
				},
			],
			carts: [
				{
					id: "c-1",
					user: BUYER.id,
					status: "active",
					items: [
						{
							id: "i-1",
							listing: "l-1",
							product: "p-1",
							variant: "v-1",
							shop: SHOP,
							quantity: 1,
							priceAtAdd: 10_000,
							addedAt: NOW.toISOString(),
						},
					],
				},
			],
			orders: [],
			"order-items": [],
			"order-events": [],
			"stock-movements": [],
			sequences: [],
			"buyer-phone-scores": [],
			"connected-accounts": [],
			"payout-accounts": [],
			"payout-holds": [],
			refunds: [],
			payouts: [],
			"webhook-events": [],
			"payment-intents": [],
			"reconciliation-runs": [],
			"reconciliation-mismatches": [],
			"ledger-accounts": [],
			"ledger-transactions": [],
		},
		{
			uniques: {
				carts: [["user", "status"]],
				"buyer-phone-scores": [["phoneHash"]],
				orders: [["buyer", "idempotencyKey"]],
				"payment-intents": [["idempotencyKey"]],
				"connected-accounts": [["shop", "provider"]],
				"webhook-events": [["provider", "providerEventId"]],
				payouts: [["providerTransferId"]],
				refunds: [["idempotencyKey"]],
				"ledger-accounts": [["key"]],
				"ledger-transactions": [["idempotencyKey"]],
			},
			globals: {
				"app-settings": {
					orders: STAGING_ORDERS,
					payments: STAGING_PAYMENTS,
					company: {
						legalName: "BuyNSellem SARL",
						supportEmail: "support@buynsellem.com",
						supportPhone: "+237600000000",
					},
				},
			},
			secret: "staging-rehearsal-secret",
		},
	);
}

const baseQuoteInput = (patch: Record<string, unknown> = {}) => ({
	address: {
		recipientName: "Jean Mballa",
		phone: BUYER_PHONE,
		city: "douala",
		district: "douala.akwa",
		landmark: "Pres de la pharmacie",
		instructions: "Appeler avant livraison",
	},
	deliveryOptionId: "seller_delivery:douala",
	paymentMethod: "mobile_money",
	locale: "fr",
	...patch,
});

let idempotencySeq = 0;
async function quotedInput(payload: FakePayload): Promise<CheckoutPlaceInput> {
	idempotencySeq += 1;
	const quote = await quoteCheckout(payload, BUYER, baseQuoteInput(), {
		now: NOW,
		store: new MemoryCounterStore(),
	});
	return {
		...baseQuoteInput(),
		quoteHash: quote.quoteHash,
		termsAccepted: true,
		idempotencyKey: `mm-idem-${idempotencySeq}`,
	};
}

function orderAt(payload: FakePayload): Order {
	return payload.store.orders[0] as unknown as Order;
}

function intentAt(payload: FakePayload): PaymentIntent {
	return payload.store["payment-intents"][0] as unknown as PaymentIntent;
}

/** Delivers a signed fake event through the real marketplace webhook route,
 * then runs the job it queues (the fake's `jobs.queue` is a mock, never a
 * real worker) — the same two-step the house's webhook specs use. */
async function deliverWebhook(
	payload: FakePayload,
	signed: { rawBody: string; headers: Record<string, string> },
) {
	const before = payload.store["webhook-events"]?.length ?? 0;
	const res = await marketplaceWebhookPOST(
		new Request("http://localhost/api/public/payments/webhook/notchpay", {
			method: "POST",
			headers: signed.headers,
			body: signed.rawBody,
		}),
	);
	expect(res.status).toBe(200);
	const events = payload.store["webhook-events"] as unknown as Array<{
		id: string;
	}>;
	expect(events.length).toBe(before + 1);
	const eventId = events[events.length - 1].id;
	const outcome = await processWebhookEvent(payload, eventId);
	return outcome;
}

const asRoute = (shopId: string) => ({
	params: Promise.resolve({ id: shopId }),
});

async function onboard(payload: FakePayload) {
	payload.auth.mockResolvedValue({ user: OWNER });
	getPayloadMock.mockResolvedValue(payload);
	return onboardingPOST(
		new Request(`http://x/api/shops/${SHOP}/payments/onboarding`, {
			method: "POST",
			body: JSON.stringify({ platform: "web" }),
		}),
		asRoute(SHOP),
	);
}

/** `splitAmounts` on a 10 000 XAF item + 2 000 delivery, 8% commission
 * (`orders.defaultCommissionRateBps`'s own default), 19.25% VAT, 3% buyer
 * protection — pinned so the whole-object ledger assertion below is a value,
 * not a recomputation. */
const SPLIT = splitAmounts({
	orderTotal: 12_000,
	commission: 800,
	vatRateBps: 1925,
	protection: { bps: 300, min: 100, max: 15_000 },
});

beforeAll(async () => {
	getPayloadMock.mockResolvedValue(fakePayload());
	await requireUser(new Request("http://x"));
}, 60_000);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	vi.stubEnv("PROTECTED_PAYMENT_ALLOWED", "true");
	vi.stubEnv("PAYMENTS_PROVIDER", "fake");
	vi.stubEnv("PUBLIC_WEB_URL", "https://web.test");
	process.env.ORDER_PHONE_PEPPER = "staging-pepper";
	sendSms.mockClear();
	invoices.issueBuyerFeeInvoice.mockClear();
	invoices.issueApplicationFeeCommissionInvoice.mockClear();
});

afterEach(() => {
	vi.unstubAllEnvs();
	process.env.ORDER_PHONE_PEPPER = undefined;
	vi.useRealTimers();
});

describe("staging rehearsal: fake provider, real routes and services, end to end", () => {
	it("pays, delivers, completes, releases and pays out one order, then seven clean nights and one tampered one", async () => {
		const payload = world();
		getPayloadMock.mockResolvedValue(payload);
		const fake = sharedFakeMarketplace();

		// Step 0: staging's own config passes the real AppSettings gate —
		// the flag, the gates and PROTECTED_PAYMENT_ALLOWED together, not
		// asserted by construction.
		expect(() => savesCleanly(STAGING_PAYMENTS, STAGING_ORDERS)).not.toThrow();

		// Step 1: seller onboarding, through the real route, to an eligible
		// connected account.
		const onboardRes = await onboard(payload);
		expect(onboardRes.status).toBe(200);
		const connected = payload.store["connected-accounts"][0] as unknown as {
			id: string;
			providerAccountId: string;
			status: string;
		};
		expect(connected.status).toBe("created");
		const accountId = connected.providerAccountId;

		fake.script(accountId, [
			{
				entity: "account",
				status: "active",
				chargesEnabled: true,
				payoutsEnabled: true,
				requirementsDue: [],
			},
		]);
		await deliverWebhook(payload, fake.advance(accountId));
		const activated = (await payload.findByID({
			collection: "connected-accounts",
			id: connected.id,
		})) as unknown as {
			status: string;
			chargesEnabled: boolean;
			payoutsEnabled: boolean;
		};
		expect([
			activated.status,
			activated.chargesEnabled,
			activated.payoutsEnabled,
		]).toEqual(["active", true, true]);

		// Step 2: the payout account, to eligible — the owner's identity
		// matches the account holder's name exactly, so it activates without
		// a moderation review.
		const payoutAccount = await submitPayoutAccount(payload, OWNER, SHOP, {
			method: "mtn_momo",
			accountName: "Aicha Ngo Mbappe",
			accountNumber: OWNER_PHONE,
		});
		expect(payoutAccount.status).toBe("active");

		// Step 3: the buyer places a real mobile-money order; the quote's
		// fee is priced server-side, never a client literal.
		const quote = await quoteCheckout(payload, BUYER, baseQuoteInput(), {
			now: NOW,
			store: new MemoryCounterStore(),
		});
		expect(quote.summary.amounts).toEqual({
			subtotal: 10_000,
			deliveryFee: 2_000,
			discount: 0,
			buyerProtectionFee: SPLIT.buyerProtectionFee,
			total: SPLIT.buyerTotal,
			currency: "XAF",
		});
		const placed = await placeOrder(
			payload,
			BUYER,
			await quotedInput(payload),
			{
				now: NOW,
				store: new MemoryCounterStore(),
			},
		);
		expect(placed.confirmationRequired).toBe("none");
		const order = orderAt(payload);
		expect({
			status: order.status,
			paymentMethod: order.paymentMethod,
			paymentStatus: order.paymentStatus,
			total: order.amounts?.total,
		}).toEqual({
			status: "placed",
			paymentMethod: "mobile_money",
			paymentStatus: "unpaid",
			total: SPLIT.buyerTotal,
		});

		// Step 4: the payment intent, through the real service — moves the
		// order to `awaiting_payment` and the intent to `pending` at the
		// fake provider.
		const intentResponse = await createCheckoutIntent(
			{ payload },
			order,
			BUYER,
			{ channel: "cm.mtn", phone: BUYER_PHONE, idempotencyKey: "intent-1" },
			{ provider: fake, now: NOW, serverUrl: "https://api.test" },
		);
		expect(intentResponse.status).toBe("pending");
		const awaiting = await payload.findByID({
			collection: "orders",
			id: order.id,
		});
		expect(awaiting.paymentStatus).toBe("awaiting_payment");
		const intent = intentAt(payload);
		const reference = intent.reference as string;

		// Step 5: the fake's webhook reports success — through the real
		// webhook route, then the real job.
		fake.script(reference, [{ entity: "payment", status: "succeeded" }]);
		const settled = await deliverWebhook(payload, fake.advance(reference));
		expect(settled.outcome).toBe("applied");
		const paid = await payload.findByID({ collection: "orders", id: order.id });
		expect([paid.status, paid.paymentStatus]).toEqual(["paid", "paid"]);
		const charge = (
			payload.store["ledger-transactions"] as unknown as Array<{ kind: string }>
		).find((t) => t.kind === "charge");
		expect(charge).toBeDefined();

		// Step 6: accept, ship, deliver — the real seller-side services.
		await acceptOrder(payload, OWNER, String(order.id));
		await shipOrder(payload, OWNER, String(order.id));
		const shipped = await payload.findByID({
			collection: "orders",
			id: order.id,
		});
		await withTransaction(
			payload,
			(req) =>
				markDelivered(req, shipped as unknown as Order, {
					method: "seller_declaration",
					actorType: "seller",
					actor: OWNER.id,
				}),
			{ user: OWNER },
		);
		const delivered = await payload.findByID({
			collection: "orders",
			id: order.id,
		});
		expect(delivered.status).toBe("delivered");
		const completeAt = delivered.deadlines?.completeAt as string;

		// Step 7: complete — the real sweep job, once the withdrawal window
		// has run out. Its registry-driven handler posts the release.
		vi.setSystemTime(new Date(completeAt).getTime() + HOUR);
		const completion = await completeOrders(payload);
		expect(completion).toEqual({ completed: 1, errors: 0 });
		const completed = await payload.findByID({
			collection: "orders",
			id: order.id,
		});
		expect(completed.status).toBe("completed");
		expect(
			(
				payload.store["ledger-transactions"] as unknown as Array<{
					kind: string;
				}>
			).filter((t) => t.kind === "release"),
		).toHaveLength(1);

		// Step 7b: the shop's first three orders carry a fraud-review hold on
		// their own payout, ending 72 h after completion (`fraudTriggers.ts`'s
		// first-orders rule) — real production behaviour, not a rehearsal
		// shortcut. Advance past it and let the real sweep clear it.
		vi.setSystemTime(new Date(completeAt).getTime() + HOUR + 73 * HOUR);
		const expired = await expirePayoutHolds(payload, new Date());
		expect(expired.expired).toHaveLength(1);

		// Step 8: the payout batch — the real release-eligible-funds pass.
		const batch = await releaseEligibleFunds(payload, new Date(), {
			provider: fake,
		});
		expect(batch.payouts).toMatchObject([
			{ amount: SPLIT.destinationAmount, status: "pending" },
		]);
		const payout = (
			payload.store.payouts as unknown as Array<{ id: string }>
		)[0];

		// Step 9: the payout-complete webhook, through the same real route.
		const payoutRef = payoutReference(payout.id);
		fake.script(payoutRef, [{ entity: "transfer", status: "complete" }]);
		const payoutSettled = await deliverWebhook(
			payload,
			fake.advance(payoutRef),
		);
		expect(payoutSettled.outcome).toBe("applied");
		const paidOut = (
			payload.store.payouts as unknown as Array<{ status: string }>
		)[0];
		expect(paidOut.status).toBe("complete");

		// Final state: the whole-object ledger pin, a value and not an
		// absence of complaint.
		const finalBalances = {
			seller_pending: await accountBalance(
				payload,
				"seller_pending",
				SHOP,
				"XAF",
			),
			seller_releasable: await accountBalance(
				payload,
				"seller_releasable",
				SHOP,
				"XAF",
			),
			seller_payout_in_transit: await accountBalance(
				payload,
				"seller_payout_in_transit",
				SHOP,
				"XAF",
			),
			seller_receivable: await accountBalance(
				payload,
				"seller_receivable",
				SHOP,
				"XAF",
			),
			buyer_refund_in_transit: await accountBalance(
				payload,
				"buyer_refund_in_transit",
				null,
				"XAF",
			),
			platform_fee_unearned: await accountBalance(
				payload,
				"platform_fee_unearned",
				null,
				"XAF",
			),
			platform_revenue_commission: await accountBalance(
				payload,
				"platform_revenue_commission",
				null,
				"XAF",
			),
			platform_revenue_protection_fee: await accountBalance(
				payload,
				"platform_revenue_protection_fee",
				null,
				"XAF",
			),
			vat_payable: await accountBalance(payload, "vat_payable", null, "XAF"),
			provider_position: await accountBalance(
				payload,
				"provider_position",
				null,
				"XAF",
			),
			provider_fee_expense: await accountBalance(
				payload,
				"provider_fee_expense",
				null,
				"XAF",
			),
			buyer_guarantee_expense: await accountBalance(
				payload,
				"buyer_guarantee_expense",
				null,
				"XAF",
			),
		};
		expect(finalBalances).toEqual({
			seller_pending: 0,
			seller_releasable: 0,
			seller_payout_in_transit: 0,
			seller_receivable: 0,
			buyer_refund_in_transit: 0,
			platform_fee_unearned: 0,
			platform_revenue_commission: SPLIT.commission,
			platform_revenue_protection_fee:
				SPLIT.buyerProtectionFee - SPLIT.buyerProtectionFeeVat,
			vat_payable: SPLIT.commissionVat + SPLIT.buyerProtectionFeeVat,
			provider_position: SPLIT.applicationFee,
			provider_fee_expense: 0,
			buyer_guarantee_expense: 0,
		});

		// The provider holds nothing more for this shop: zero in-transit and
		// zero releasable, matching the ledger exactly.
		await fake.getConnectedAccountBalance(accountId); // sanity: account resolves
		fake.setBalance(accountId, { available: 0, pending: 0 });

		// Seven consecutive clean nights, the clock one day further each
		// time from the moment the payout actually completed — the house's
		// own reconciliation idiom.
		const settledAt = Date.now();
		for (let night = 1; night <= 7; night++) {
			vi.setSystemTime(settledAt + night * DAY);
			const result = await runReconciliation(
				payload,
				reconciliationWindow(new Date()),
			);
			expect(result.status).toBe("succeeded");
			expect(result.counts?.mismatches).toBe(0);
			expect(
				(
					payload.store["reconciliation-mismatches"] as unknown as Array<{
						status: string;
					}>
				).filter((m) => m.status === "open"),
			).toEqual([]);
		}

		// The eighth, deliberately tampered: the alarm must actually ring.
		fake.setBalance(accountId, { available: 1_000, pending: 0 });
		vi.setSystemTime(settledAt + 8 * DAY);
		const tampered = await runReconciliation(
			payload,
			reconciliationWindow(new Date()),
		);
		expect(tampered.counts?.mismatches).toBeGreaterThan(0);
		const openMismatches = (
			payload.store["reconciliation-mismatches"] as unknown as Array<{
				status: string;
				kind: string;
				shop: string;
			}>
		).filter((m) => m.status === "open");
		expect(openMismatches).toEqual([
			expect.objectContaining({
				kind: "balance_mismatch",
				shop: SHOP,
				status: "open",
			}),
		]);

		// Ledger integrity held throughout: no drift between the cache and
		// what the postings actually say, at any point in the rehearsal.
		const integrity = await ledgerIntegrity(payload);
		expect(integrity.unbalanced).toEqual([]);
		for (const { account, recomputed } of integrity.accounts) {
			expect(account.balance).toBe(recomputed);
		}
	}, 30_000);
});

describe("the hot-account load test: N concurrent postings on one shop's ledger", () => {
	const HOT_SHOP = "hot-1";
	const CURRENCY = "XAF";
	/** 60 concurrent charges — pinned per-charge amounts, same `SPLIT` as the
	 * rehearsal above. */
	const N = 60;

	function hotWorld(): FakePayload {
		return fakePayload(
			{
				users: [{ id: "u-1", role: "user" }],
				shops: [
					{ id: HOT_SHOP, name: "Hot shop", owner: "u-1", status: "active" },
				],
				"ledger-accounts": [],
				"ledger-transactions": [],
			},
			{
				uniques: {
					"ledger-accounts": [["key"]],
					"ledger-transactions": [["idempotencyKey"]],
				},
			},
		);
	}

	it(`keeps the balance cache correct under ${N} concurrent charge postings, no lost $inc, no duplicate idempotency keys`, async () => {
		const payload = hotWorld();
		const postOne = (i: number) =>
			withTransaction(payload, (req) =>
				postLedger(req, {
					kind: "charge",
					occurredAt: NOW,
					sourceType: "webhook-event",
					sourceId: `hot-intent-${i}`,
					currency: CURRENCY,
					shop: HOT_SHOP,
					paymentIntent: `hot-intent-${i}`,
					entries: postingFor("charge", SPLIT),
				}),
			);

		const results = await Promise.all(
			Array.from({ length: N }, (_, i) => postOne(i)),
		);

		expect(results.every((r) => r.created)).toBe(true);
		const transactions = payload.store[
			"ledger-transactions"
		] as unknown as Array<{
			idempotencyKey: string;
		}>;
		expect(transactions).toHaveLength(N);
		expect(new Set(transactions.map((t) => t.idempotencyKey)).size).toBe(N);

		const integrity = await ledgerIntegrity(payload);
		expect(integrity.unbalanced).toEqual([]);
		for (const { account, recomputed } of integrity.accounts) {
			expect(account.balance).toBe(recomputed);
		}

		expect({
			provider_position: await accountBalance(
				payload,
				"provider_position",
				null,
				CURRENCY,
			),
			seller_pending: await accountBalance(
				payload,
				"seller_pending",
				HOT_SHOP,
				CURRENCY,
			),
			platform_fee_unearned: await accountBalance(
				payload,
				"platform_fee_unearned",
				null,
				CURRENCY,
			),
			platform_revenue_protection_fee: await accountBalance(
				payload,
				"platform_revenue_protection_fee",
				null,
				CURRENCY,
			),
			vat_payable: await accountBalance(payload, "vat_payable", null, CURRENCY),
		}).toEqual({
			provider_position: N * SPLIT.buyerTotal,
			seller_pending: N * SPLIT.destinationAmount,
			platform_fee_unearned: N * (SPLIT.commission + SPLIT.commissionVat),
			platform_revenue_protection_fee:
				N * (SPLIT.buyerProtectionFee - SPLIT.buyerProtectionFeeVat),
			vat_payable: N * SPLIT.buyerProtectionFeeVat,
		});
	});
});

/**
 * The international rule, demonstrated. A rehearsal market (ZZ, ZZD with two
 * decimals) is a row, a city and a registered fake: it goes draft -> review ->
 * live and carries a multi-shop cart to delivery and a balanced ledger with
 * no line of src naming it. Memory-server contention is approximate (the fake
 * serialises what Mongo would race); the live-Mongo leg is the staging pass.
 */
const ZZ_PHONE = BUYER_PHONE;
const ZZ_ORDER_NOW = new Date("2026-10-09T08:00:00.000Z");

function zzMarketRow(): Doc {
	return {
		...cmMarketRow(),
		id: "market-zz",
		countryCode: "ZZ",
		name: "Zedland",
		status: "draft",
		currency: { code: "ZZD", minorUnit: 2, rounding: "half_even" },
		formatting: [
			{
				locale: "fr",
				symbol: "ZZD",
				position: "after",
				groupSeparator: ".",
				decimalSeparator: ",",
			},
			{
				locale: "en",
				symbol: "ZZD",
				position: "before",
				groupSeparator: ",",
				decimalSeparator: ".",
			},
		],
		timezone: "Pacific/Auckland",
		vatRateBps: 1000,
		payments: {
			provider: "notchpay",
			settlementMode: "provider_split",
			channels: ["cm.mtn"],
			enabled: true,
		},
		// PAYMENT_CHANNELS and its dial-code rules know only the cm.* rails: a
		// new operator is code, so the rehearsal rides an existing one.
		features: { cod: true, protectedPayment: true },
		regulatoryReview: undefined,
	};
}

/**
 * A city key outside launchCities is the per-market user gate (the generated
 * douala|yaounde enums, cart orderability, delivery quoting); the rehearsal
 * borrows an existing key (CM's row of it absent from this world:
 * marketOfShopCity picks the first row of a key, it does not read the country).
 */
const ZZ_CITY = "yaounde";
const zzCityRow = (): Doc => ({
	id: "zz:zedton",
	market: "market-zz",
	key: ZZ_CITY,
	label: "Zedton",
	defaultDeliveryFee: 250,
	districts: [{ slug: "centre", label: "Centre" }],
	active: true,
	sortOrder: 0,
});

const ZZ_SELLER = {
	codEnabled: true,
	sellerDeliveryEnabled: true,
	deliveryFee: null,
	deliveryEtaText: "24-48h",
	pickupEnabled: false,
	salesTermsExtra: null,
};
const zzShop = (id: string) => ({
	id,
	owner: `${id}-owner`,
	name: `Shop ${id}`,
	handle: `shop-${id}`,
	status: "active",
	level: 2,
	levelExpiresAt: null,
	ordersRestrictedAt: null,
	location: { city: ZZ_CITY, countryCode: "ZZ" },
	contact: { phone: "+237690000000" },
	orderSettings: ZZ_SELLER,
});
const zzOwner = (id: string) => ({
	id: `${id}-owner`,
	role: "user" as const,
	name: `Owner ${id}`,
	email: `${id}@test.zz`,
	suspendedAt: null,
	suspendedUntil: null,
});
const ZZ_SHOPS = ["za", "zb", "zc"] as const;

function zzWorld(
	options: { stockOfB?: number; buyers?: string[] } = {},
): FakePayload {
	const buyers = options.buyers ?? ["zbuyer"];
	return fakePayload(
		{
			markets: [cmMarketRow(), zzMarketRow()],
			"market-cities": [zzCityRow()],
			users: [
				...ZZ_SHOPS.map((id) => ({
					...zzOwner(id),
					phone: `+23767100${id.charCodeAt(1)}00`.slice(0, 13),
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
				})),
				...buyers.map((id) => ({
					id,
					role: "user",
					name: id,
					email: `${id}@test.zz`,
					phone: ZZ_PHONE,
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
					suspendedAt: null,
					suspendedUntil: null,
				})),
			],
			shops: ZZ_SHOPS.map(zzShop),
			"shop-members": ZZ_SHOPS.map((id) => ({
				id: `sm-${id}`,
				shop: id,
				user: `${id}-owner`,
				status: "active",
				role: "owner",
			})),
			products: ZZ_SHOPS.map((id) => ({
				id: `p-${id}`,
				shop: id,
				title: `Item ${id}`,
				status: "active",
				delivery: { codAllowed: true },
				returnPolicy: "30 days",
			})),
			"product-variants": ZZ_SHOPS.map((id) => ({
				id: `v-${id}`,
				product: `p-${id}`,
				shop: id,
				sku: `SKU-${id}`,
				price: id === "za" ? 25_000 : 15_000,
				trackInventory: true,
				stockOnHand: id === "zb" ? (options.stockOfB ?? 5) : 5,
				stockReserved: 0,
				archivedAt: null,
			})),
			listings: ZZ_SHOPS.map((id) => ({
				id: `l-${id}`,
				shop: id,
				product: `p-${id}`,
				title: `Item ${id}`,
				status: "published",
				condition: "new",
				category: "cat-1",
			})),
			categories: [{ id: "cat-1", name: "Audio" }],
			carts: [],
			orders: [],
			"order-items": [],
			"order-events": [],
			"stock-movements": [],
			sequences: [],
			"buyer-phone-scores": [],
			"connected-accounts": ZZ_SHOPS.map((id) => ({
				id: `ca-${id}`,
				shop: id,
				provider: "notchpay",
				providerAccountId: `acct_${id}`,
				status: "active",
				chargesEnabled: true,
				payoutsEnabled: true,
			})),
			"payout-accounts": ZZ_SHOPS.map((id) => ({
				id: `pa-${id}`,
				shop: id,
				status: "active",
				method: "mtn_momo",
			})),
			"payout-holds": [],
			refunds: [],
			payouts: [],
			"webhook-events": [],
			"payment-intents": [],
			"reconciliation-runs": [],
			"reconciliation-mismatches": [],
			"ledger-accounts": [],
			"ledger-transactions": [],
		},
		{
			uniques: {
				carts: [["user", "status"]],
				"buyer-phone-scores": [["phoneHash"]],
				orders: [["buyer", "idempotencyKey"]],
				"payment-intents": [["idempotencyKey"]],
				"connected-accounts": [["shop", "provider"]],
				"webhook-events": [["provider", "providerEventId"]],
				payouts: [["providerTransferId"]],
				refunds: [["idempotencyKey"]],
				"ledger-accounts": [["key"]],
				"ledger-transactions": [["idempotencyKey"]],
			},
			globals: {
				"app-settings": {
					orders: {
						enabled: true,
						multiShopCartEnabled: true,
						termsVersion: "2026-09",
						pilotShopIds: [],
						vatRateBps: 1925,
						buyerCaps: { new: { maxOpenOrders: 5, maxOrderTotal: null } },
					},
					payments: {
						protectedPayment: { enabled: true },
						releaseModel: "provider_hold" as const,
						markets: [],
						gates: GATES,
					},
					company: {
						legalName: "BuyNSellem SARL",
						supportEmail: "support@buynsellem.com",
						supportPhone: "+237600000000",
					},
				},
			},
			secret: "zz-rehearsal-secret",
		},
	);
}

const zzDraft = (paymentMethod = "mobile_money") => ({
	address: {
		recipientName: "Jean Mballa",
		phone: ZZ_PHONE,
		city: ZZ_CITY,
		district: `${ZZ_CITY}.centre`,
		landmark: "Next to the market hall",
		instructions: "Call before delivery",
	},
	deliveryOptionId: `seller_delivery:${ZZ_CITY}`,
	paymentMethod,
	locale: "en",
});

let zzSeq = 0;
async function zzInput(
	payload: FakePayload,
	user: { id: string },
): Promise<CheckoutPlaceInput> {
	const view = await quoteCheckoutResponse(payload, user, zzDraft(), {
		now: ZZ_ORDER_NOW,
		store: new MemoryCounterStore(),
	});
	if (!("groups" in view)) throw new Error("expected a split quote");
	zzSeq += 1;
	return {
		...zzDraft(),
		quoteHash: (view as SplitQuoteView).quoteHash,
		termsAccepted: true,
		idempotencyKey: `zz-idem-${zzSeq}`,
	};
}

async function zzFill(
	payload: FakePayload,
	user: { id: string },
	shops = ZZ_SHOPS as readonly string[],
) {
	for (const id of shops)
		await addCartItem(payload, user, {
			listingId: `l-${id}`,
			variantId: `v-${id}`,
			quantity: 1,
		});
}

const zzPlace = async (
	payload: FakePayload,
	user: { id: string },
	input: CheckoutPlaceInput,
) => {
	const res = await placeCheckoutResponse(payload, user, input, {
		now: ZZ_ORDER_NOW,
		store: new MemoryCounterStore(),
	});
	if (!("orders" in res)) throw new Error("expected a split placement");
	return res as SplitPlaceResponse;
};

type Rec = Record<string, unknown>;
const zzRows = (payload: FakePayload, collection: string) =>
	(payload.store[collection] ?? []) as unknown as Rec[];

/** The Markets collection's own beforeChange hook, the way a staff save runs it. */
async function saveMarket(payload: FakePayload, patch: Rec) {
	const original = zzRows(payload, "markets").find((m) => m.id === "market-zz");
	if (!original) throw new Error("no ZZ row");
	const hook = Markets.hooks?.beforeChange?.[0];
	if (!hook) throw new Error("no beforeChange hook");
	await hook({
		data: patch,
		originalDoc: original,
		req: { payload },
	} as unknown as Parameters<typeof hook>[0]);
	await payload.update({ collection: "markets", id: "market-zz", data: patch });
	invalidateMarketCache(payload);
}

describe("the rehearsal market: ZZ goes live and trades with no code change", () => {
	let unregister: () => void;
	let zzFake: FakeMarketplaceProvider;

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(ZZ_ORDER_NOW);
		vi.stubEnv("PROTECTED_PAYMENT_ALLOWED", "true");
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("PAYMENTS_PROVIDER", "");
		vi.stubEnv("PUBLIC_WEB_URL", "https://web.test");
		process.env.ORDER_PHONE_PEPPER = "zz-pepper";
		zzFake = new FakeMarketplaceProvider({
			now: () => new Date(),
			currency: "ZZD",
		});
		for (const id of ZZ_SHOPS) zzFake.seedAccount({ accountId: `acct_${id}` });
		// The same seam a real adapter uses; the registry itself is untouched.
		unregister = registerMarketplaceProvider("notchpay", () => zzFake);
	});
	afterEach(() => {
		unregister();
		vi.unstubAllEnvs();
		process.env.ORDER_PHONE_PEPPER = undefined;
		vi.useRealTimers();
	});

	it("is refused a launch without evidence or an adapter, then admitted through the gate in order", async () => {
		const payload = zzWorld();
		getPayloadMock.mockResolvedValue(payload);
		const ctx = {
			payload,
			id: "market-zz",
			env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
		};
		const row = zzRows(payload, "markets").find(
			(m) => m.id === "market-zz",
		) as Rec;

		await expect(saveMarket(payload, { status: "live" })).rejects.toThrow(
			/cannot move from draft to live/,
		);
		await saveMarket(payload, { status: "review" });

		// No evidence filed, and (in production) no adapter yet.
		unregister();
		expect(
			await marketRefusal(
				{ ...row, status: "live" },
				{ ...row, status: "review" },
				ctx,
			),
		).toMatch(
			/counsel's review filed as evidence[\s\S]*no payment adapter is registered for "notchpay"/,
		);
		unregister = registerMarketplaceProvider("notchpay", () => zzFake);
		expect(
			await marketRefusal(
				{ ...row, status: "live" },
				{ ...row, status: "review" },
				ctx,
			),
		).toMatch(
			/^A market cannot go live without counsel's review filed as evidence\.$/,
		);

		await saveMarket(payload, {
			status: "live",
			regulatoryReview: { evidence: "ev-zz-counsel" },
		});
		expect((await getMarket(payload, "ZZ")).status).toBe("live");
		expect(
			(await getMarkets(payload)).map((m) => m.countryCode).sort(),
		).toEqual(["CM", "ZZ"]);
	});

	it("carries a three-shop cart from quote to delivered, settled and balanced, order by order", async () => {
		const payload = zzWorld();
		getPayloadMock.mockResolvedValue(payload);
		await saveMarket(payload, { status: "review" });
		await saveMarket(payload, {
			status: "live",
			regulatoryReview: { evidence: "ev-zz-counsel" },
		});

		const { getMarketplaceProvider } = await import(
			"../../src/lib/payments/marketplaceRegistry"
		);
		expect(
			getMarketplaceProvider(await getPaymentSettings(payload), {
				countryCode: "ZZ",
			}),
		).toBe(zzFake);

		const buyer = { id: "zbuyer" };
		await zzFill(payload, buyer);
		const quote = (await quoteCheckoutResponse(payload, buyer, zzDraft(), {
			now: ZZ_ORDER_NOW,
			store: new MemoryCounterStore(),
		})) as SplitQuoteView;
		expect(quote.groups).toHaveLength(3);

		const res = await zzPlace(payload, buyer, await zzInput(payload, buyer));
		expect(res.orders.map((o) => o.currency)).toEqual(["ZZD", "ZZD", "ZZD"]);
		const orders = zzRows(payload, "orders");
		expect(orders.map((o) => o.market)).toEqual([
			"market-zz",
			"market-zz",
			"market-zz",
		]);
		expect(new Set(orders.map((o) => o.checkoutGroup)).size).toBe(1);

		// The market's own two-decimal row renders what the order owes.
		const zz = await getMarket(payload, "ZZ");
		const format = zz.formats.find((f) => f.locale === "en");
		if (!format) throw new Error("no en format");
		const subtotal = (orders[0].amounts as { subtotal: number }).subtotal;
		expect(formatMoney(subtotal, format)).toBe("ZZD 250.00");

		// Paid order by order, each through the real webhook route and job.
		const intents: Rec[] = [];
		for (const o of res.orders) {
			const order = zzRows(payload, "orders").find(
				(r) => r.id === o.id,
			) as unknown as Order;
			const payer = {
				id: "zbuyer",
				role: "user" as const,
				name: "zbuyer",
				email: "zbuyer@test.zz",
				suspendedAt: null,
				suspendedUntil: null,
			};
			const intentRes = await createCheckoutIntent(
				{ payload },
				order,
				payer,
				{
					channel: "cm.mtn",
					phone: ZZ_PHONE,
					idempotencyKey: `zz-intent-${o.id}`,
				},
				{ provider: zzFake, now: ZZ_ORDER_NOW, serverUrl: "https://api.test" },
			);
			expect(intentRes.status).toBe("pending");
			const intent = zzRows(payload, "payment-intents").find(
				(i) => i.targetId === o.id,
			) as Rec;
			intents.push(intent);
			zzFake.script(String(intent.reference), [
				{ entity: "payment", status: "succeeded" },
			]);
			const settled = await deliverWebhook(
				payload,
				zzFake.advance(String(intent.reference)),
			);
			expect(settled.outcome).toBe("applied");
			expect(intent.currency).toBe("ZZD");
		}
		const group = await readCheckoutGroup(
			payload,
			buyer,
			res.checkoutGroup,
			ZZ_ORDER_NOW,
		);
		expect(
			group.orders.map((o) => [o.status, o.paymentStatus, o.payableNow]),
		).toEqual([
			["paid", "paid", false],
			["paid", "paid", false],
			["paid", "paid", false],
		]);

		// Delivered by each shop's own owner, then the sweep, holds and payouts.
		for (const [i, o] of res.orders.entries()) {
			const owner = zzOwner(ZZ_SHOPS[i]);
			await acceptOrder(payload, owner, o.id);
			await shipOrder(payload, owner, o.id);
			const shipped = zzRows(payload, "orders").find(
				(r) => r.id === o.id,
			) as unknown as Order;
			await withTransaction(
				payload,
				(req) =>
					markDelivered(req, shipped, {
						method: "seller_declaration",
						actorType: "seller",
						actor: owner.id,
					}),
				{ user: owner },
			);
		}
		const delivered = zzRows(payload, "orders") as unknown as Order[];
		expect(delivered.map((o) => o.status)).toEqual([
			"delivered",
			"delivered",
			"delivered",
		]);
		const completeAt = Math.max(
			...delivered.map((o) =>
				new Date(String(o.deadlines?.completeAt)).getTime(),
			),
		);
		vi.setSystemTime(completeAt + HOUR);
		expect(await completeOrders(payload)).toEqual({ completed: 3, errors: 0 });
		vi.setSystemTime(completeAt + HOUR + 73 * HOUR);
		await expirePayoutHolds(payload, new Date());
		const batch = await releaseEligibleFunds(payload, new Date(), {
			provider: zzFake,
		});
		expect(batch.payouts).toHaveLength(3);
		for (const p of zzRows(payload, "payouts")) {
			const ref = payoutReference(String(p.id));
			zzFake.script(ref, [{ entity: "transfer", status: "complete" }]);
			expect((await deliverWebhook(payload, zzFake.advance(ref))).outcome).toBe(
				"applied",
			);
		}
		expect(zzRows(payload, "payouts").map((p) => p.status)).toEqual([
			"complete",
			"complete",
			"complete",
		]);

		// Every ZZ posting is ZZD, every transit bucket is empty, the ledger balances.
		for (const id of ZZ_SHOPS) {
			for (const cat of [
				"seller_pending",
				"seller_releasable",
				"seller_payout_in_transit",
				"seller_receivable",
			] as const)
				expect(await accountBalance(payload, cat, id, "ZZD")).toBe(0);
		}
		const accounts = zzRows(payload, "ledger-accounts");
		expect(accounts.length).toBeGreaterThan(0);
		expect(new Set(accounts.map((a) => a.currency))).toEqual(new Set(["ZZD"]));
		expect(
			await accountBalance(payload, "platform_revenue_commission", null, "ZZD"),
		).toBeGreaterThan(0);
		expect((await ledgerIntegrity(payload)).unbalanced).toEqual([]);
	}, 30_000);

	it("lets one of two concurrent split placements through, and answers an idempotency replay with the same group", async () => {
		const payload = zzWorld({ stockOfB: 1, buyers: ["zbuyer", "zrival"] });
		getPayloadMock.mockResolvedValue(payload);
		await saveMarket(payload, { status: "review" });
		await saveMarket(payload, {
			status: "live",
			regulatoryReview: { evidence: "ev-zz-counsel" },
		});
		const [one, two] = [{ id: "zbuyer" }, { id: "zrival" }];
		await zzFill(payload, one);
		await zzFill(payload, two);
		const [inOne, inTwo] = [
			await zzInput(payload, one),
			await zzInput(payload, two),
		];

		const opts = () => ({ now: ZZ_ORDER_NOW, store: new MemoryCounterStore() });
		const settled = await Promise.allSettled([
			placeCheckoutResponse(payload, one, inOne, opts()),
			placeCheckoutResponse(payload, two, inTwo, opts()),
		]);
		expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const lost = settled.find(
			(r) => r.status === "rejected",
		) as PromiseRejectedResult;
		expect(lost.reason).toMatchObject({
			code: "checkout.stockChanged",
			status: 409,
		});
		expect(zzRows(payload, "orders")).toHaveLength(3);
		expect(
			zzRows(payload, "product-variants").map((v) => v.stockReserved),
		).toEqual([1, 1, 1]);

		// The winner's key replayed over the same quote creates nothing new.
		const winner =
			settled[0].status === "fulfilled" ? [one, inOne] : [two, inTwo];
		const first = settled.find(
			(r) => r.status === "fulfilled",
		) as PromiseFulfilledResult<unknown>;
		const again = await placeCheckoutResponse(
			payload,
			winner[0] as { id: string },
			winner[1] as CheckoutPlaceInput,
			opts(),
		);
		expect(again).toEqual(first.value);
		expect(zzRows(payload, "orders")).toHaveLength(3);
	});

	it("reconciles a ledger holding XAF and ZZD, each currency on its own, and flags a gap in one", async () => {
		const payload = zzWorld();
		getPayloadMock.mockResolvedValue(payload);
		const post = (currency: string, shop: string, n: number) =>
			withTransaction(payload, (req) =>
				postLedger(req, {
					kind: "charge",
					occurredAt: ZZ_ORDER_NOW,
					sourceType: "webhook-event",
					sourceId: `mixed-${currency}-${n}`,
					currency,
					shop,
					paymentIntent: `mixed-${currency}-${n}`,
					entries: postingFor("charge", SPLIT),
				}),
			);
		await post("XAF", "za", 1);
		await post("ZZD", "zb", 1);
		await post("ZZD", "zb", 2);
		// The provider holds exactly what the seller ledgers say it does.
		zzFake.setBalance("acct_za", {
			available: 0,
			pending: SPLIT.destinationAmount,
		});
		zzFake.setBalance("acct_zb", {
			available: 0,
			pending: 2 * SPLIT.destinationAmount,
		});
		const reconcile = () =>
			runReconciliation(payload, reconciliationWindow(ZZ_ORDER_NOW), {
				provider: zzFake,
				now: ZZ_ORDER_NOW,
				settings: { ...PAYMENT_DEFAULTS, markets: [...DEFAULT_MARKETS] },
			});

		const clean = await reconcile();
		expect(clean.counts?.mismatches).toBe(0);
		const sum = SPLIT.buyerTotal;
		expect((await ledgerIntegrity(payload)).byCurrency).toEqual({
			XAF: { debit: sum, credit: sum },
			ZZD: { debit: 2 * sum, credit: 2 * sum },
		});

		const zzd = zzRows(payload, "ledger-accounts").find(
			(a) => a.currency === "ZZD",
		);
		const planted = zzRows(payload, "ledger-transactions").find((t) =>
			(t.entries as Array<{ account: unknown }>).some(
				(e) => String(e.account) === String(zzd?.id),
			),
		) as unknown as { id: unknown; entries: Array<{ debit: number }> };
		planted.entries[0].debit += 7;
		const integrity = await ledgerIntegrity(payload);
		expect(integrity.byCurrency).toEqual({
			XAF: { debit: sum, credit: sum },
			ZZD: { debit: 2 * sum + 7, credit: 2 * sum },
		});
		expect(integrity.unbalanced).toEqual([
			{
				transaction: String(planted.id),
				currency: "ZZD",
				debit: sum + 7,
				credit: sum,
			},
		]);
		const tampered = await reconcile();
		expect(tampered.counts?.mismatches).toBeGreaterThan(0);
		expect(
			(
				zzRows(payload, "reconciliation-mismatches") as Array<{
					status: string;
					kind: string;
				}>
			).filter((m) => m.status === "open" && m.kind === "unbalanced_ledger"),
		).not.toHaveLength(0);
	});
});

describe("the rehearsal needed no code", () => {
	const SRC_ROOTS = [
		"api/src",
		"web/src",
		"web/messages",
		"mobile/src",
		"mobile/app",
	];
	const PKGS = join(import.meta.dirname, "..", "..", "..");
	const walk = (dir: string): string[] =>
		readdirSync(dir).flatMap((name) => {
			const path = join(dir, name);
			if (statSync(path).isDirectory())
				return name === "test" ? [] : walk(path);
			return /\.(test|fixture)\.tsx?$/.test(name) ? [] : [path];
		});

	it("names neither the country nor its currency anywhere a client or the api ships", () => {
		const hits = SRC_ROOTS.flatMap((root) => walk(join(PKGS, root))).flatMap(
			(file) =>
				readFileSync(file, "utf8")
					.split("\n")
					.flatMap((line, i) =>
						/\bZZD?\b/.test(line) ? [`${file}:${i + 1}`] : [],
					),
		);
		expect(hits).toEqual([]);
	});

	it("is registered through the one seam, which still serves a registered adapter ahead of any default", async () => {
		const zz = new FakeMarketplaceProvider({ currency: "ZZD" });
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("PAYMENTS_PROVIDER", "");
		const off = registerMarketplaceProvider("notchpay", () => zz);
		try {
			const { getMarketplaceProvider } = await import(
				"../../src/lib/payments/marketplaceRegistry"
			);
			expect(
				getMarketplaceProvider({
					...PAYMENT_DEFAULTS,
					markets: [...DEFAULT_MARKETS],
				}),
			).toBe(zz);
		} finally {
			off();
			vi.unstubAllEnvs();
		}
	});
});

describe("the flag-off CM parity sweep, at close", () => {
	async function cm() {
		const api = withRawMongo(fakePayload({ "market-cities": [] }));
		await migrateP10Markets(api);
		return { api, market: await getMarket(api, "CM") };
	}
	const AMOUNTS = [
		0, 1, 99, 1000, 1410, 47_000, 123_456, 1_234_567, -1, -47_000,
	];

	it("renders every golden amount byte-identically to the legacy formatter, in both languages", async () => {
		const { market } = await cm();
		for (const locale of ["fr", "en"] as const) {
			const format = market.formats.find((f) => f.locale === locale);
			if (!format) throw new Error(`no ${locale} format`);
			for (const amount of AMOUNTS)
				expect(
					[...formatMoney(amount, format)].map((c) => c.codePointAt(0)),
				).toEqual([...formatXaf(amount, locale)].map((c) => c.codePointAt(0)));
		}
	});

	it("holds the seeded cities and the phone rule to the literals they replaced", async () => {
		const { api, market } = await cm();
		const cities = await getMarketCities(api, market);
		expect(cities.map((c) => c.key)).toEqual([...LAUNCH_CITY_KEYS]);
		for (const city of cities) {
			const literal = LAUNCH_CITIES[city.key as keyof typeof LAUNCH_CITIES];
			expect([
				city.label,
				city.defaultDeliveryFee,
				city.districts.map((d) => d.slug),
			]).toEqual([
				literal.label,
				literal.defaultDeliveryFee,
				[...literal.districts],
			]);
		}
		expect(market.phone.pattern).toBe(DELIVERY_PHONE_PATTERN.source);
	});

	it("keeps quoting a CM cart as the flat legacy shape with a live ZZ market beside it", async () => {
		const payload = fakePayload(
			{
				markets: [cmMarketRow(), { ...zzMarketRow(), status: "live" }],
				"market-cities": [...launchCitySeedRows("market-cm"), zzCityRow()],
				users: [
					{
						...BUYER,
						phone: BUYER_PHONE,
						phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
					},
				],
				shops: [
					{
						id: SHOP,
						name: "Chez Aicha",
						handle: "chez-aicha",
						owner: OWNER.id,
						status: "active",
						level: 2,
						location: { city: "douala", countryCode: "CM" },
						orderSettings: ZZ_SELLER,
					},
				],
				products: [
					{
						id: "p-1",
						shop: SHOP,
						status: "active",
						delivery: { codAllowed: true },
					},
				],
				"product-variants": [
					{
						id: "v-1",
						product: "p-1",
						shop: SHOP,
						sku: "A",
						price: 10_000,
						trackInventory: true,
						stockOnHand: 5,
						stockReserved: 0,
						archivedAt: null,
					},
				],
				listings: [
					{
						id: "l-1",
						title: "A",
						status: "published",
						shop: SHOP,
						product: "p-1",
						condition: "new",
						category: "cat-1",
					},
				],
				categories: [{ id: "cat-1", name: "Audio" }],
				carts: [],
				orders: [],
				"buyer-phone-scores": [],
			},
			{
				globals: {
					"app-settings": {
						orders: {
							enabled: true,
							launchCities: [{ key: "douala", deliveryFee: 2_000 }],
							termsVersion: "2026-09",
							vatRateBps: 1925,
						},
					},
				},
			},
		);
		await addCartItem(payload, BUYER, {
			listingId: "l-1",
			variantId: "v-1",
			quantity: 1,
		});
		const view = await quoteCheckoutResponse(
			payload,
			BUYER,
			baseQuoteInput({ paymentMethod: "cod" }),
			{
				now: NOW,
				store: new MemoryCounterStore(),
			},
		);
		expect("groups" in view).toBe(false);
		expect(
			(view as { summary: { amounts: { currency: string; subtotal: number } } })
				.summary.amounts,
		).toMatchObject({
			currency: "XAF",
			subtotal: 10_000,
		});
	});
});
