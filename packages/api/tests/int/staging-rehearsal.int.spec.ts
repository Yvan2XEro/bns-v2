// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { completeOrders } from "../../src/jobs/completeOrders";
import { AppSettings } from "../../src/globals/AppSettings";
import { splitAmounts } from "../../src/lib/paymentMath";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { requireUser } from "../../src/lib/shopRoute";
import { withTransaction } from "../../src/lib/transactions";
import { sharedFakeMarketplace } from "../../src/lib/payments/marketplaceRegistry";
import type { Order, PaymentIntent } from "../../src/payload-types";
import {
	accountBalance,
	ledgerIntegrity,
	postingFor,
	postLedger,
} from "../../src/services/ledger";
import { quoteCheckout, placeOrder, type CheckoutPlaceInput } from "../../src/services/checkout";
import { createCheckoutIntent } from "../../src/services/checkoutPayment";
import { markDelivered } from "../../src/services/orders/delivery";
import { acceptOrder, shipOrder } from "../../src/services/orders/acceptance";
import { submitPayoutAccount } from "../../src/services/payoutAccounts";
import { expirePayoutHolds } from "../../src/services/payoutHolds";
import { payoutReference, releaseEligibleFunds } from "../../src/services/payouts";
import {
	reconciliationWindow,
	runReconciliation,
} from "../../src/services/reconciliation";
import { processWebhookEvent } from "../../src/services/webhookEvents";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

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
const OWNER = { id: "u-owner", role: "user" as const, name: "Aicha", email: "owner@test.cm", suspendedAt: null, suspendedUntil: null };
const BUYER = { id: "u-buyer", role: "user" as const, name: "Buyer", email: "buyer@test.cm", suspendedAt: null, suspendedUntil: null };
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
function savesCleanly(payments: Record<string, unknown>, orders: Record<string, unknown>) {
	type Hook = (args: { data: Doc; originalDoc?: Doc }) => Doc;
	let data: Doc = { payments, orders };
	for (const hook of (AppSettings.hooks?.beforeChange ?? []) as unknown as Hook[]) {
		data = hook({ data, originalDoc: { orders: { vatRateBps: 1925 }, payments: {} } });
	}
	return data;
}

function world(): FakePayload {
	return fakePayload(
		{
			users: [
				{
					...OWNER,
					phone: OWNER_PHONE,
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
					identityVerifiedAt: "2026-09-01T00:00:00.000Z",
					identityVerification: "vr-1",
				},
				{ ...BUYER, phone: BUYER_PHONE, phoneVerifiedAt: "2026-01-01T00:00:00.000Z" },
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
				{ id: "sm-1", shop: SHOP, user: OWNER.id, status: "active", role: "owner" },
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
async function deliverWebhook(payload: FakePayload, signed: { rawBody: string; headers: Record<string, string> }) {
	const before = payload.store["webhook-events"]?.length ?? 0;
	const res = await marketplaceWebhookPOST(
		new Request("http://localhost/api/public/payments/webhook/notchpay", {
			method: "POST",
			headers: signed.headers,
			body: signed.rawBody,
		}),
	);
	expect(res.status).toBe(200);
	const events = payload.store["webhook-events"] as unknown as Array<{ id: string }>;
	expect(events.length).toBe(before + 1);
	const eventId = events[events.length - 1].id;
	const outcome = await processWebhookEvent(payload, eventId);
	return outcome;
}

const asRoute = (shopId: string) => ({ params: Promise.resolve({ id: shopId }) });

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
	it(
		"pays, delivers, completes, releases and pays out one order, then seven clean nights and one tampered one",
		async () => {
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
				{ entity: "account", status: "active", chargesEnabled: true, payoutsEnabled: true, requirementsDue: [] },
			]);
			await deliverWebhook(payload, fake.advance(accountId));
			const activated = (await payload.findByID({
				collection: "connected-accounts",
				id: connected.id,
			})) as unknown as { status: string; chargesEnabled: boolean; payoutsEnabled: boolean };
			expect([activated.status, activated.chargesEnabled, activated.payoutsEnabled]).toEqual([
				"active",
				true,
				true,
			]);

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
			const placed = await placeOrder(payload, BUYER, await quotedInput(payload), {
				now: NOW,
				store: new MemoryCounterStore(),
			});
			expect(placed.confirmationRequired).toBe("sms_code");
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
			const awaiting = await payload.findByID({ collection: "orders", id: order.id });
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
			const charge = (payload.store["ledger-transactions"] as unknown as Array<{ kind: string }>).find(
				(t) => t.kind === "charge",
			);
			expect(charge).toBeDefined();

			// Step 6: accept, ship, deliver — the real seller-side services.
			await acceptOrder(payload, OWNER, String(order.id));
			await shipOrder(payload, OWNER, String(order.id));
			const shipped = await payload.findByID({ collection: "orders", id: order.id });
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
			const delivered = await payload.findByID({ collection: "orders", id: order.id });
			expect(delivered.status).toBe("delivered");
			const completeAt = delivered.deadlines?.completeAt as string;

			// Step 7: complete — the real sweep job, once the withdrawal window
			// has run out. Its registry-driven handler posts the release.
			vi.setSystemTime(new Date(completeAt).getTime() + HOUR);
			const completion = await completeOrders(payload);
			expect(completion).toEqual({ completed: 1, errors: 0 });
			const completed = await payload.findByID({ collection: "orders", id: order.id });
			expect(completed.status).toBe("completed");
			expect(
				(payload.store["ledger-transactions"] as unknown as Array<{ kind: string }>).filter(
					(t) => t.kind === "release",
				),
			).toHaveLength(1);

			// Step 7b: the shop's first three orders carry a fraud-review hold on
			// their own payout, ending 72 h after completion (`fraudTriggers.ts`'s
			// first-orders rule) — real production behaviour, not a rehearsal
			// shortcut. Advance past it and let the real sweep clear it.
			vi.setSystemTime(new Date(completeAt).getTime() + HOUR + 73 * HOUR);
			const expired = await expirePayoutHolds(payload, new Date());
			expect(expired.expired).toHaveLength(1);

			// Step 8: the payout batch — the real release-eligible-funds pass.
			const batch = await releaseEligibleFunds(payload, new Date(), { provider: fake });
			expect(batch.payouts).toMatchObject([{ amount: SPLIT.destinationAmount, status: "pending" }]);
			const payout = (payload.store.payouts as unknown as Array<{ id: string }>)[0];

			// Step 9: the payout-complete webhook, through the same real route.
			const payoutRef = payoutReference(payout.id);
			fake.script(payoutRef, [{ entity: "transfer", status: "complete" }]);
			const payoutSettled = await deliverWebhook(payload, fake.advance(payoutRef));
			expect(payoutSettled.outcome).toBe("applied");
			const paidOut = (payload.store.payouts as unknown as Array<{ status: string }>)[0];
			expect(paidOut.status).toBe("complete");

			// Final state: the whole-object ledger pin, a value and not an
			// absence of complaint.
			const finalBalances = {
				seller_pending: await accountBalance(payload, "seller_pending", SHOP, "XAF"),
				seller_releasable: await accountBalance(payload, "seller_releasable", SHOP, "XAF"),
				seller_payout_in_transit: await accountBalance(payload, "seller_payout_in_transit", SHOP, "XAF"),
				seller_receivable: await accountBalance(payload, "seller_receivable", SHOP, "XAF"),
				buyer_refund_in_transit: await accountBalance(payload, "buyer_refund_in_transit", null, "XAF"),
				platform_fee_unearned: await accountBalance(payload, "platform_fee_unearned", null, "XAF"),
				platform_revenue_commission: await accountBalance(payload, "platform_revenue_commission", null, "XAF"),
				platform_revenue_protection_fee: await accountBalance(
					payload,
					"platform_revenue_protection_fee",
					null,
					"XAF",
				),
				vat_payable: await accountBalance(payload, "vat_payable", null, "XAF"),
				provider_position: await accountBalance(payload, "provider_position", null, "XAF"),
				provider_fee_expense: await accountBalance(payload, "provider_fee_expense", null, "XAF"),
				buyer_guarantee_expense: await accountBalance(payload, "buyer_guarantee_expense", null, "XAF"),
			};
			expect(finalBalances).toEqual({
				seller_pending: 0,
				seller_releasable: 0,
				seller_payout_in_transit: 0,
				seller_receivable: 0,
				buyer_refund_in_transit: 0,
				platform_fee_unearned: 0,
				platform_revenue_commission: SPLIT.commission,
				platform_revenue_protection_fee: SPLIT.buyerProtectionFee - SPLIT.buyerProtectionFeeVat,
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
				const result = await runReconciliation(payload, reconciliationWindow(new Date()));
				expect(result.status).toBe("succeeded");
				expect(result.counts?.mismatches).toBe(0);
				expect(
					(payload.store["reconciliation-mismatches"] as unknown as Array<{ status: string }>).filter(
						(m) => m.status === "open",
					),
				).toEqual([]);
			}

			// The eighth, deliberately tampered: the alarm must actually ring.
			fake.setBalance(accountId, { available: 1_000, pending: 0 });
			vi.setSystemTime(settledAt + 8 * DAY);
			const tampered = await runReconciliation(payload, reconciliationWindow(new Date()));
			expect(tampered.counts?.mismatches).toBeGreaterThan(0);
			const openMismatches = (
				payload.store["reconciliation-mismatches"] as unknown as Array<{
					status: string;
					kind: string;
					shop: string;
				}>
			).filter((m) => m.status === "open");
			expect(openMismatches).toEqual([
				expect.objectContaining({ kind: "balance_mismatch", shop: SHOP, status: "open" }),
			]);

			// Ledger integrity held throughout: no drift between the cache and
			// what the postings actually say, at any point in the rehearsal.
			const integrity = await ledgerIntegrity(payload);
			expect(integrity.unbalanced).toEqual([]);
			for (const { account, recomputed } of integrity.accounts) {
				expect(account.balance).toBe(recomputed);
			}
		},
		30_000,
	);
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
				shops: [{ id: HOT_SHOP, name: "Hot shop", owner: "u-1", status: "active" }],
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

		const results = await Promise.all(Array.from({ length: N }, (_, i) => postOne(i)));

		expect(results.every((r) => r.created)).toBe(true);
		const transactions = payload.store["ledger-transactions"] as unknown as Array<{
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
			provider_position: await accountBalance(payload, "provider_position", null, CURRENCY),
			seller_pending: await accountBalance(payload, "seller_pending", HOT_SHOP, CURRENCY),
			platform_fee_unearned: await accountBalance(payload, "platform_fee_unearned", null, CURRENCY),
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
			platform_revenue_protection_fee: N * (SPLIT.buyerProtectionFee - SPLIT.buyerProtectionFeeVat),
			vat_payable: N * SPLIT.buyerProtectionFeeVat,
		});
	});
});
