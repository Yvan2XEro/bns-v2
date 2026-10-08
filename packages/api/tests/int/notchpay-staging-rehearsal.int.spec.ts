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
 * The NotchPay adapter rehearsal: the P5 staging rehearsal's lifecycle with the
 * fake swapped for the real adapter, production env and registration, over
 * the recorded replay transport (zero network). It proves the adapter slots
 * into the real economy end to end; the live sandbox pass, its seven real
 * nights and the gates stay the user's (see the release record).
 *
 * The same three leaf seams as the P5 rehearsal are mocked.
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

import { AppSettings } from "../../src/globals/AppSettings";
import { completeOrders } from "../../src/jobs/completeOrders";
import { splitAmounts } from "../../src/lib/paymentMath";
import {
	PAYMENT_DEFAULTS,
	type PaymentSettings,
} from "../../src/lib/paymentSettings";
import {
	adapterPresenceRefusal,
	getMarketplaceProvider,
	registerMarketplaceProvider,
} from "../../src/lib/payments/marketplaceRegistry";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { requireUser } from "../../src/lib/shopRoute";
import { withTransaction } from "../../src/lib/transactions";
import type { Order, PaymentIntent } from "../../src/payload-types";
import {
	type CheckoutPlaceInput,
	placeOrder,
	quoteCheckout,
} from "../../src/services/checkout";
import { createCheckoutIntent } from "../../src/services/checkoutPayment";
import { accountBalance, ledgerIntegrity } from "../../src/services/ledger";
import { acceptOrder, shipOrder } from "../../src/services/orders/acceptance";
import { markDelivered } from "../../src/services/orders/delivery";
import { submitPayoutAccount } from "../../src/services/payoutAccounts";
import { expirePayoutHolds } from "../../src/services/payoutHolds";
import {
	payoutReference,
	releaseEligibleFunds,
} from "../../src/services/payouts";
import { processWebhookEvent } from "../../src/services/webhookEvents";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";
import {
	chargeOf,
	makeReplayProvider,
	payoutOf,
	signedFromTemplate,
} from "./helpers/notchpayContractDriver";

const { POST: onboardingPOST } = await import(
	"../../src/app/(frontend)/api/shops/[id]/payments/onboarding/route"
);
const { POST: marketplaceWebhookPOST } = await import(
	"../../src/app/(frontend)/api/public/payments/webhook/notchpay/route"
);

const NOW = new Date("2026-10-08T08:00:00.000Z");
const HOUR = 3_600_000;

const SHOP = "s-1";
const RESELLER_PAYOUT = "RP-2610-000001";
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

const STAGING_SETTINGS: PaymentSettings = {
	...PAYMENT_DEFAULTS,
	...STAGING_PAYMENTS,
	markets: STAGING_PAYMENTS.markets.map((m) => ({
		...m,
		channels: [...m.channels],
	})),
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
			"reseller-payouts": [
				{
					id: "rp-1",
					reference: RESELLER_PAYOUT,
					status: "pending",
					commissions: [],
					charges: [],
					statusHistory: [],
				},
			],
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
			secret: "np-rehearsal-secret",
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

/** Delivers a signed recorded event through the real marketplace webhook route,
 * then runs the job it queues (the fake payload's `jobs.queue` is a mock, never a
 * real worker) — the same two-step the house's webhook specs use. */
type Signed = { rawBody: string; headers: Record<string, string> };
const day: Signed[] = [];

async function deliverWebhook(payload: FakePayload, signed: Signed) {
	day.push(signed);
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
	vi.stubEnv("NODE_ENV", "production");
	process.env.PAYMENTS_PROVIDER = undefined;
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

describe("NotchPay adapter rehearsal: real adapter on recorded fixtures, real routes and services", () => {
	it("pays, delivers, completes, releases and pays out one order, then replays the whole day to the same ledger", async () => {
		day.length = 0;
		const payload = world();
		getPayloadMock.mockResolvedValue(payload);
		const { provider, replay } = makeReplayProvider();

		// The replay-backed adapter takes the registry's place (a booted config may have registered the live one already).
		const unregister = registerMarketplaceProvider("notchpay", () => provider);
		try {
			expect(adapterPresenceRefusal(STAGING_PAYMENTS, process.env)).toBeNull();
			expect(getMarketplaceProvider(STAGING_SETTINGS)).toBe(provider);
			expect(() =>
				savesCleanly(STAGING_PAYMENTS, STAGING_ORDERS),
			).not.toThrow();

			const onboardRes = await onboard(payload);
			expect(onboardRes.status).toBe(200);
			const connected = payload.store["connected-accounts"][0] as unknown as {
				id: string;
				providerAccountId: string;
				status: string;
			};
			expect(connected.status).toBe("created");
			const accountId = connected.providerAccountId;

			replay.setMode(`account:${accountId}`, "active");
			await deliverWebhook(
				payload,
				signedFromTemplate("account-updated-active-sync", {
					account: accountId,
				}),
			);
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

			const payoutAccount = await submitPayoutAccount(payload, OWNER, SHOP, {
				method: "mtn_momo",
				accountName: "Aicha Ngo Mbappe",
				accountNumber: OWNER_PHONE,
			});
			expect(payoutAccount.status).toBe("active");

			const placed = await placeOrder(
				payload,
				BUYER,
				await quotedInput(payload),
				{
					now: NOW,
					store: new MemoryCounterStore(),
				},
			);
			expect(placed.confirmationRequired).toBe("sms_code");
			const order = orderAt(payload);
			expect(order.amounts?.total).toBe(SPLIT.buyerTotal);

			// No provider is passed: the registry hands the adapter to the service.
			const intentResponse = await createCheckoutIntent(
				{ payload },
				order,
				BUYER,
				{ channel: "cm.mtn", phone: BUYER_PHONE, idempotencyKey: "intent-1" },
				{ now: NOW, serverUrl: "https://api.test" },
			);
			expect(intentResponse.status).toBe("pending");
			const reference = intentAt(payload).reference as string;
			const sent = chargeOf(replay, reference);
			expect(sent.account).toBe(accountId);

			replay.setMode(`payment:${reference}`, "succeeded");
			const settled = await deliverWebhook(
				payload,
				signedFromTemplate("payment-succeeded-sync", {
					ref: reference,
					amount: sent.amount,
					account: sent.account,
				}),
			);
			expect(settled.outcome).toBe("applied");
			const paid = await payload.findByID({
				collection: "orders",
				id: order.id,
			});
			expect([paid.status, paid.paymentStatus]).toEqual(["paid", "paid"]);
			const kinds = () =>
				(
					payload.store["ledger-transactions"] as unknown as Array<{
						kind: string;
					}>
				).map((t) => t.kind);
			expect(kinds().filter((k) => k === "charge")).toHaveLength(1);

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

			vi.setSystemTime(new Date(completeAt).getTime() + HOUR);
			expect(await completeOrders(payload)).toEqual({
				completed: 1,
				errors: 0,
			});
			expect(kinds().filter((k) => k === "release")).toHaveLength(1);

			vi.setSystemTime(new Date(completeAt).getTime() + HOUR + 73 * HOUR);
			const expired = await expirePayoutHolds(payload, new Date());
			expect(expired.expired).toHaveLength(1);

			// No provider is passed here either.
			const batch = await releaseEligibleFunds(payload, new Date());
			expect(batch.payouts).toMatchObject([
				{ amount: SPLIT.destinationAmount, status: "pending" },
			]);
			const payout = (
				payload.store.payouts as unknown as Array<{
					id: string;
					providerTransferId: string;
				}>
			)[0];

			const payoutRef = payoutReference(payout.id);
			const wire = payoutOf(replay, payoutRef);
			expect(wire).toEqual({
				account: accountId,
				amount: SPLIT.destinationAmount,
			});
			replay.setMode(`transfer:${payout.providerTransferId}`, "complete");
			const transferVars = {
				transferId: payout.providerTransferId,
				ref: payoutRef,
				account: wire.account,
				amount: wire.amount,
			};
			await deliverWebhook(
				payload,
				signedFromTemplate("transfer-sent-sync", transferVars),
			);
			const payoutSettled = await deliverWebhook(
				payload,
				signedFromTemplate("transfer-complete-sync", transferVars),
			);
			expect(payoutSettled.outcome).toBe("applied");
			expect(
				(payload.store.payouts as unknown as Array<{ status: string }>)[0]
					.status,
			).toBe("complete");

			// An RP- transfer rides the same route and lands on the reseller payout, not a PO- row.
			const resellerOutcome = await deliverWebhook(
				payload,
				signedFromTemplate("transfer-complete-sync", {
					transferId: "tr_RP-1",
					ref: RESELLER_PAYOUT,
					account: "platform",
					amount: 12_000,
				}),
			);
			expect(resellerOutcome.outcome).toBe("applied");
			expect(payload.store["reseller-payouts"][0]).toMatchObject({
				status: "complete",
				providerTransferId: "tr_RP-1",
			});
			expect(payload.store.payouts).toHaveLength(1);

			const balancesNow = async () => ({
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
			});
			const finalBalances = await balancesNow();
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

			// The whole recorded day again: duplicates are stored once and settle nothing twice.
			const rowCounts = () =>
				Object.fromEntries(
					Object.entries(payload.store).map(([name, rows]) => [
						name,
						rows.length,
					]),
				);
			const before = rowCounts();
			for (const signed of day.slice()) {
				const res = await marketplaceWebhookPOST(
					new Request("http://localhost/api/public/payments/webhook/notchpay", {
						method: "POST",
						headers: signed.headers,
						body: signed.rawBody,
					}),
				);
				expect(res.status).toBe(200);
				expect(await res.json()).toMatchObject({ duplicate: true });
			}
			for (const row of payload.store["webhook-events"] as unknown as Array<{
				id: string;
			}>) {
				await processWebhookEvent(payload, row.id);
			}
			expect(rowCounts()).toEqual(before);
			expect(await balancesNow()).toEqual(finalBalances);

			const integrity = await ledgerIntegrity(payload);
			expect(integrity.unbalanced).toEqual([]);
			for (const { account, recomputed } of integrity.accounts) {
				expect(account.balance).toBe(recomputed);
			}
		} finally {
			unregister();
		}
	}, 30_000);
});
