// @vitest-environment node
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import type { Order, PaymentIntent } from "../../src/payload-types";
import type { ServiceUser } from "../../src/services/shops";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

/**
 * The real service and routes against the in-memory Payload fake and the fake
 * marketplace. Doubled: `getPayload` (so `requireUser` resolves the fake), the
 * registry (so the routes reach the test's fake provider), and `settlePayment`
 * — wrapped, still the real one — so the poll's `source` is observable.
 */
const { getPayloadMock, registry, settleSpy } = vi.hoisted(() => ({
	getPayloadMock: vi.fn(),
	registry: { provider: null as unknown },
	settleSpy: { fn: null as null | Mock },
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
vi.mock("../../src/lib/payments/marketplaceRegistry", () => ({
	getMarketplaceProvider: () => registry.provider,
}));
vi.mock("../../src/services/payments", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../src/services/payments")>();
	const settlePayment = vi.fn(actual.settlePayment);
	settleSpy.fn = settlePayment;
	return { ...actual, settlePayment };
});

import { GET } from "../../src/app/(frontend)/api/orders/[id]/payment/route";
import { POST } from "../../src/app/(frontend)/api/orders/[id]/payment-intents/route";
import { requireUser } from "../../src/lib/shopRoute";
import {
	type CheckoutIntentInput,
	createCheckoutIntent,
	type PaymentIntentResponse,
	paymentStatusView,
} from "../../src/services/checkoutPayment";

const NOW = new Date("2026-10-03T10:00:00.000Z");
const MIN = 60_000;
const SHOP = "shop-1";
const ORDER = "o-1";
const OWNER = "u-owner";
const MANAGER = "u-manager";
const SHOP_STAFF = "u-staff";
const BUYER = "u-buyer";
const STRANGER = "u-stranger";
const ACCOUNT = "acct_seed";
const BUYER_PHONE = "+237690000009";
const OWNER_PHONE = "+237670000001";
const MANAGER_PHONE = "+237670000002";
const KEY = "0b7c1a52-5d0e-4c55-9a8e-3f1f6a0e0001";
const KEY_2 = "0b7c1a52-5d0e-4c55-9a8e-3f1f6a0e0002";

/** The worked order: 50 000 goods + 2 000 delivery, 2 500 commission (5%). */
const WORKED = {
	commission: 2500,
	commissionVat: 481, // 2500 × 19.25 %
	buyerProtectionFee: 1560, // 3 % of 52 000
	buyerProtectionFeeVat: 252, // 1560 − round(1560 × 10000 / 11925)
	applicationFee: 4541, // 2500 + 481 + 1560
	destinationAmount: 49019, // 52000 − 2500 − 481
	buyerTotal: 53560, // 4541 + 49019
};

const GATES = ["G1", "G2", "G3", "G4", "G5", "G6"].map((gate) => ({
	gate,
	clearedAt: "2026-09-30T00:00:00.000Z",
	clearedBy: "admin",
	evidence: `ev-${gate}`,
	note: null,
}));

function payments(overrides: Doc = {}, market: Doc = {}): Doc {
	return {
		protectedPayment: { enabled: true },
		releaseModel: "provider_hold",
		markets: [
			{
				countryCode: "CM",
				currency: "XAF",
				provider: "notchpay",
				settlementMode: "provider_split",
				channels: ["cm.mtn", "cm.orange"],
				vatRateBps: 1925,
				enabled: true,
				...market,
			},
		],
		gates: GATES,
		...overrides,
	};
}

const userDoc = (id: string, extra: Doc = {}): Doc => ({
	id,
	email: `${id}@test.cm`,
	name: id,
	role: "user",
	...extra,
});

const verified = (phone: string): Doc => ({
	phone,
	phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
});

const member = (user: string, role: string, extra: Doc = {}): Doc => ({
	id: `m-${user}`,
	shop: SHOP,
	user,
	role,
	status: "active",
	...extra,
});

function orderDoc(overrides: Doc = {}): Doc {
	return {
		id: ORDER,
		orderNumber: "BNS-2610-000001",
		buyer: BUYER,
		shop: SHOP,
		status: "placed",
		paymentMethod: "mobile_money",
		paymentStatus: "unpaid",
		amounts: {
			subtotal: 50000,
			deliveryFee: 2000,
			discount: 0,
			buyerProtectionFee: 0,
			total: 52000,
			currency: "XAF",
		},
		timestamps: { placedAt: new Date(NOW.getTime() - 5 * MIN).toISOString() },
		createdAt: new Date(NOW.getTime() - 5 * MIN).toISOString(),
		...overrides,
	};
}

/** A paid, not-completed protected order of the same shop, counted as exposure. */
function openOrder(id: string, total: number, extra: Doc = {}): Doc {
	return {
		id,
		orderNumber: `BNS-${id}`,
		buyer: STRANGER,
		shop: SHOP,
		status: "paid",
		paymentMethod: "mobile_money",
		paymentStatus: "paid",
		amounts: { total, currency: "XAF" },
		...extra,
	};
}

function intentDoc(id: string, overrides: Partial<PaymentIntent> = {}): Doc {
	return {
		id,
		purpose: "checkout",
		targetType: "order",
		targetId: ORDER,
		customer: BUYER,
		amount: WORKED.buyerTotal,
		currency: "XAF",
		provider: "notchpay",
		reference: `PI-${id}`,
		idempotencyKey: `checkout:${BUYER}:${id}`,
		status: "failed",
		failureCode: "declined",
		channel: "cm.orange",
		payerPhone: BUYER_PHONE,
		attempt: 1,
		createdAt: new Date(NOW.getTime() - 4 * MIN).toISOString(),
		...overrides,
	};
}

interface Seed {
	shop?: Doc;
	order?: Doc;
	settings?: Doc;
	account?: Doc | null;
	payoutAccounts?: Doc[];
	extra?: Record<string, Doc[]>;
}

function seed(s: Seed = {}): FakePayload {
	const extra = s.extra ?? {};
	return fakePayload(
		{
			users: [
				userDoc(OWNER, verified(OWNER_PHONE)),
				userDoc(MANAGER, verified(MANAGER_PHONE)),
				// A member's number nobody verified is not "a member's verified phone".
				userDoc(SHOP_STAFF, { phone: "+237655000003" }),
				userDoc(BUYER, verified(BUYER_PHONE)),
				userDoc(STRANGER),
			],
			shops: [
				{
					id: SHOP,
					name: "Boutique Wax",
					owner: OWNER,
					status: "active",
					level: 2,
					location: { countryCode: "CM" },
					...s.shop,
				},
			],
			"shop-members": [
				member(OWNER, "owner"),
				member(MANAGER, "manager"),
				member(SHOP_STAFF, "staff"),
			],
			"connected-accounts":
				s.account === null
					? []
					: [
							{
								id: "ca-1",
								shop: SHOP,
								provider: "notchpay",
								providerAccountId: ACCOUNT,
								status: "active",
								chargesEnabled: true,
								payoutsEnabled: true,
								...s.account,
							},
						],
			"payout-accounts": s.payoutAccounts ?? [
				{ id: "pa-1", shop: SHOP, status: "active", method: "mtn_momo" },
			],
			orders: [orderDoc(s.order), ...(extra.orders ?? [])],
			"order-items": [
				{
					id: "oi-1",
					order: ORDER,
					lineSubtotal: 50000,
					commissionAmount: 2500,
				},
			],
			"payment-intents": extra["payment-intents"] ?? [],
			"payout-holds": extra["payout-holds"] ?? [],
		},
		{
			uniques: { "payment-intents": [["idempotencyKey"]] },
			globals: { "app-settings": { payments: s.settings ?? payments() } },
		},
	);
}

const asUser = (id: string): ServiceUser => ({
	id,
	role: "user",
	name: id,
	email: `${id}@test.cm`,
	suspendedAt: null,
	suspendedUntil: null,
});

let payload: FakePayload;
let fake: FakeMarketplaceProvider;

function use(p: FakePayload) {
	payload = p;
	getPayloadMock.mockResolvedValue(payload);
}

const input = (
	over: Partial<CheckoutIntentInput> = {},
): CheckoutIntentInput => ({
	channel: "cm.orange",
	phone: BUYER_PHONE,
	idempotencyKey: KEY,
	...over,
});

const orderNow = async (): Promise<Order> =>
	payload.findByID({ collection: "orders", id: ORDER });

async function pay(
	over: Partial<CheckoutIntentInput> = {},
	userId = BUYER,
): Promise<PaymentIntentResponse> {
	return createCheckoutIntent(
		{ payload },
		await orderNow(),
		asUser(userId),
		input(over),
		{ provider: fake, serverUrl: "https://api.test" },
	);
}

async function refusal(
	over: Partial<CheckoutIntentInput> = {},
	userId = BUYER,
): Promise<{ code: string; status: number; details?: unknown }> {
	try {
		await pay(over, userId);
	} catch (error) {
		const e = error as { code: string; status: number; details?: unknown };
		return { code: e.code, status: e.status, details: e.details };
	}
	throw new Error("expected a refusal");
}

const intents = () => payload.store["payment-intents"] ?? [];

beforeAll(async () => {
	getPayloadMock.mockResolvedValue(fakePayload());
	await requireUser(new Request("http://x"));
}, 60_000);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	vi.stubEnv("PROTECTED_PAYMENT_ALLOWED", "true");
	fake = new FakeMarketplaceProvider({ now: () => new Date() });
	fake.seedAccount({ accountId: ACCOUNT });
	registry.provider = fake;
	use(seed());
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

describe("createCheckoutIntent — the happy path", () => {
	it("answers the contract's response, whole", async () => {
		const response = await pay();
		expect(response).toEqual({
			intentId: String(intents()[0]?.id),
			status: "pending",
			expiresAt: new Date(NOW.getTime() + 30 * MIN).toISOString(),
			channel: "cm.orange",
			attempt: 1,
			attemptsLeft: 2,
			instructions: null,
		});
	});

	it("writes one intent carrying the split, the account and the payer", async () => {
		await pay();
		expect(intents()).toHaveLength(1);
		const intent = intents()[0] as Doc;
		expect(intent).toMatchObject({
			purpose: "checkout",
			targetType: "order",
			targetId: ORDER,
			customer: BUYER,
			amount: WORKED.buyerTotal,
			currency: "XAF",
			provider: "notchpay",
			idempotencyKey: `checkout:${BUYER}:${KEY}`,
			status: "pending",
			reference: `PI-${intent.id}`,
			providerReference: "pay_1",
			channel: "cm.orange",
			payerPhone: BUYER_PHONE,
			connectedAccount: "ca-1",
			applicationFee: WORKED.applicationFee,
			destinationAmount: WORKED.destinationAmount,
			attempt: 1,
			expiresAt: new Date(NOW.getTime() + 30 * MIN).toISOString(),
		});
		expect(
			(intent.statusHistory as Array<{ status: string }>).map((h) => h.status),
		).toEqual(["created", "pending"]);
	});

	it("freezes the amounts and the settlement snapshot on the order and moves it to awaiting_payment", async () => {
		await pay();
		const order = await orderNow();
		expect(order.paymentStatus).toBe("awaiting_payment");
		expect(order.status).toBe("placed");
		expect(order.amounts).toEqual({
			subtotal: 50000,
			deliveryFee: 2000,
			discount: 0,
			currency: "XAF",
			buyerProtectionFee: 1560,
			buyerProtectionFeeVat: 252,
			commission: 2500,
			commissionVat: 481,
			applicationFee: 4541,
			destinationAmount: 49019,
			total: 53560,
		});
		expect(order.settlement).toEqual({
			mode: "provider_split",
			releaseModel: "provider_hold",
			connectedAccount: "ca-1",
		});
		const events = payload.store["order-events"] ?? [];
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			order: ORDER,
			type: "order.note_added",
			actorType: "buyer",
			actor: BUYER,
			visibility: "staff",
			paymentStatusFrom: "unpaid",
			paymentStatusTo: "awaiting_payment",
			metadata: {
				intentId: intents()[0]?.id,
				attempt: 1,
				channel: "cm.orange",
			},
		});
	});

	it("charges fixed amounts after commit, then pushes the prompt to the payer's phone", async () => {
		await pay();
		const reference = `PI-${intents()[0]?.id}`;
		expect(fake.calls.map((c) => c.method)).toEqual([
			"createDestinationCharge",
			"chargeMobileMoney",
		]);
		expect(fake.callsTo("createDestinationCharge")).toEqual([
			[
				{
					reference,
					amount: 53560,
					currency: "XAF",
					applicationFee: 4541,
					destination: { accountId: ACCOUNT, amount: 49019 },
					customer: {
						email: `${BUYER}@test.cm`,
						name: BUYER,
						phone: BUYER_PHONE,
					},
					description: "Order BNS-2610-000001",
					callbackUrl: `https://api.test/api/public/payments/notchpay/callback?orderId=${ORDER}`,
				},
			],
		]);
		const [charge] = fake.callsTo("createDestinationCharge");
		expect(Object.keys(charge?.[0] ?? {})).not.toContain(
			"applicationFeePercent",
		);
		expect(fake.callsTo("chargeMobileMoney")).toEqual([
			[reference, { channel: "cm.orange", phone: BUYER_PHONE }],
		]);
	});

	it("passes the provider's action text through as instructions", async () => {
		class PromptingFake extends FakeMarketplaceProvider {
			override async chargeMobileMoney(
				reference: string,
				payer: { channel: string; phone: string },
			) {
				this.script(reference, [], { action: "Dial #150*50# to approve" });
				return super.chargeMobileMoney(reference, payer);
			}
		}
		fake = new PromptingFake();
		fake.seedAccount({ accountId: ACCOUNT });
		expect((await pay()).instructions).toBe("Dial #150*50# to approve");
	});

	it("stores the payer phone in E.164 whatever form it was typed in", async () => {
		await pay({ phone: "6 90 00 00 09" });
		expect(intents()[0]?.payerPhone).toBe(BUYER_PHONE);
	});

	it("a second attempt reuses the frozen amounts even after the fee settings changed", async () => {
		use(
			seed({
				order: {
					paymentStatus: "awaiting_payment",
					amounts: {
						subtotal: 50000,
						deliveryFee: 2000,
						total: WORKED.buyerTotal,
						buyerProtectionFee: WORKED.buyerProtectionFee,
						buyerProtectionFeeVat: WORKED.buyerProtectionFeeVat,
						commission: WORKED.commission,
						commissionVat: WORKED.commissionVat,
						applicationFee: WORKED.applicationFee,
						destinationAmount: WORKED.destinationAmount,
						currency: "XAF",
					},
					settlement: {
						mode: "provider_split",
						releaseModel: "provider_hold",
						connectedAccount: "ca-1",
					},
				},
				extra: { "payment-intents": [intentDoc("pi-old")] },
				settings: payments({
					buyerProtection: { bps: 500, min: 100, max: 15000 },
				}),
			}),
		);
		await pay();
		const second = intents().find((i) => i.id !== "pi-old");
		expect(second).toMatchObject({
			amount: WORKED.buyerTotal,
			applicationFee: WORKED.applicationFee,
			destinationAmount: WORKED.destinationAmount,
			attempt: 2,
		});
		expect(payload.store["order-events"] ?? []).toHaveLength(0);
	});
});

describe("createCheckoutIntent — the ladder, one code at a time", () => {
	describe("rule 1: payment.orderNotPayable", () => {
		it("refuses anyone but the buyer with 403, even while the flag is also off", async () => {
			use(
				seed({ settings: payments({ protectedPayment: { enabled: false } }) }),
			);
			expect(await refusal({}, STRANGER)).toEqual({
				code: "payment.orderNotPayable",
				status: 403,
				details: undefined,
			});
			expect(intents()).toHaveLength(0);
		});

		it.each([
			["not placed", { status: "confirmed" }],
			[
				"cash on delivery",
				{ paymentMethod: "cod", paymentStatus: "cod_pending" },
			],
			["already failed", { paymentStatus: "failed" }],
			["already paid", { status: "paid", paymentStatus: "paid" }],
			[
				"placed 30 minutes ago",
				{
					timestamps: {
						placedAt: new Date(NOW.getTime() - 30 * MIN).toISOString(),
					},
				},
			],
		])("refuses an order %s with 409, even while the flag is also off", async (_, order) => {
			use(
				seed({
					order,
					settings: payments({ protectedPayment: { enabled: false } }),
				}),
			);
			expect(await refusal()).toMatchObject({
				code: "payment.orderNotPayable",
				status: 409,
			});
		});

		it("still takes an order placed 29 minutes ago", async () => {
			use(
				seed({
					order: {
						timestamps: {
							placedAt: new Date(NOW.getTime() - 29 * MIN).toISOString(),
						},
					},
				}),
			);
			expect((await pay()).status).toBe("pending");
		});
	});

	describe("rule 2: eligibility", () => {
		it("flag off → payment.protectedDisabled, even while the market is also off", async () => {
			use(
				seed({
					settings: payments(
						{ protectedPayment: { enabled: false } },
						{ enabled: false },
					),
				}),
			);
			expect(await refusal()).toMatchObject({
				code: "payment.protectedDisabled",
				status: 403,
			});
		});

		it("env withdrawn → payment.protectedDisabled", async () => {
			vi.stubEnv("PROTECTED_PAYMENT_ALLOWED", "");
			expect((await refusal()).code).toBe("payment.protectedDisabled");
		});

		it("market off → payment.marketUnavailable, even while the shop is also level 1", async () => {
			use(
				seed({
					shop: { level: 1 },
					settings: payments({}, { enabled: false }),
				}),
			);
			expect(await refusal()).toMatchObject({
				code: "payment.marketUnavailable",
				status: 400,
			});
		});

		it.each<[string, Seed]>([
			["level 1", { shop: { level: 1 } }],
			["suspended", { shop: { status: "suspended" } }],
			["no connected account", { account: null }],
			["account restricted", { account: { status: "restricted" } }],
			["charges disabled", { account: { chargesEnabled: false } }],
			["payouts disabled", { account: { payoutsEnabled: false } }],
			[
				"no active payout account",
				{
					payoutAccounts: [
						{
							id: "pa-2",
							shop: SHOP,
							status: "pending_review",
							method: "mtn_momo",
						},
					],
				},
			],
			[
				"a shop hold blocking charges",
				{
					extra: {
						"payout-holds": [
							{
								id: "h-1",
								scope: "shop",
								shop: SHOP,
								reason: "fraud_signal",
								status: "active",
								blocksCharges: true,
							},
						],
					},
				},
			],
		])("%s → payment.shopNotEligible, even while the buyer is also a member", async (_, s) => {
			// MANAGER is the shop's own member: rule 3 would refuse too.
			use(seed({ ...s, order: { ...s.order, buyer: MANAGER } }));
			expect(await refusal({}, MANAGER)).toMatchObject({
				code: "payment.shopNotEligible",
				status: 403,
			});
			expect(intents()).toHaveLength(0);
		});

		it("an order-scoped hold or a released shop hold does not refuse the charge", async () => {
			use(
				seed({
					extra: {
						"payout-holds": [
							{
								id: "h-1",
								scope: "order",
								shop: SHOP,
								order: "o-9",
								reason: "fraud_signal",
								status: "active",
								blocksCharges: true,
							},
							{
								id: "h-2",
								scope: "shop",
								shop: SHOP,
								reason: "fraud_signal",
								status: "released",
								blocksCharges: true,
							},
						],
					},
				}),
			);
			expect((await pay()).status).toBe("pending");
		});

		it("takes the order when open exposure plus this order sits exactly at the level-2 cap", async () => {
			// 446 440 open + 53 560 this order = 500 000.
			use(seed({ extra: { orders: [openOrder("o-open", 446_440)] } }));
			expect((await pay()).status).toBe("pending");
		});

		it("refuses one franc over the level-2 cap, counting this order", async () => {
			// 446 441 + 53 560 = 500 001; the open orders alone are under the cap.
			use(seed({ extra: { orders: [openOrder("o-open", 446_441)] } }));
			expect(await refusal()).toMatchObject({
				code: "payment.shopNotEligible",
				status: 403,
			});
		});

		it("counts paid-not-completed orders only, net of refunds", async () => {
			use(
				seed({
					extra: {
						orders: [
							openOrder("o-completed", 400_000, { status: "completed" }),
							openOrder("o-cancelled", 400_000, {
								status: "cancelled",
								paymentStatus: "refunded",
							}),
							openOrder("o-cod", 400_000, { paymentMethod: "cod" }),
							openOrder("o-other-shop", 400_000, { shop: "shop-2" }),
							openOrder("o-partial", 456_440, {
								paymentStatus: "partially_refunded",
								settlement: { refundedAmount: 10_000 },
							}),
						],
					},
				}),
			);
			// Only o-partial counts: 456 440 − 10 000 + 53 560 = 500 000.
			expect((await pay()).status).toBe("pending");
		});

		it("uses the level-3 cap for a level-3 shop", async () => {
			use(
				seed({
					shop: { level: 3 },
					extra: { orders: [openOrder("o-open", 1_946_440)] },
				}),
			);
			expect((await pay()).status).toBe("pending");
		});

		it("halves the cap under provider_schedule", async () => {
			use(
				seed({
					settings: payments({
						releaseModel: "provider_schedule",
						gates: GATES.filter((g) => g.gate !== "G3"),
					}),
					extra: { orders: [openOrder("o-open", 196_441)] },
				}),
			);
			// 196 441 + 53 560 = 250 001 > 250 000.
			expect((await refusal()).code).toBe("payment.shopNotEligible");
		});

		it("refuses a buyer total over maxOrderAmount with payment.amountTooHigh", async () => {
			use(seed({ settings: payments({ maxOrderAmount: 53_559 }) }));
			expect(await refusal()).toMatchObject({
				code: "payment.amountTooHigh",
				status: 400,
			});
		});
	});

	describe("rule 3: payment.selfPurchase", () => {
		it("refuses a buyer who is an active member, even with an unsupported channel", async () => {
			use(seed({ order: { buyer: MANAGER } }));
			expect(await refusal({ channel: "cm.wave" }, MANAGER)).toMatchObject({
				code: "payment.selfPurchase",
				status: 403,
			});
		});

		it("refuses a stranger's account paying with the owner's verified phone (Review Focus 5)", async () => {
			expect(
				await refusal({ phone: OWNER_PHONE, channel: "cm.mtn" }),
			).toMatchObject({ code: "payment.selfPurchase", status: 403 });
			expect(intents()).toHaveLength(0);
			expect(fake.calls).toHaveLength(0);
		});

		it("refuses a member's verified phone typed without its country code", async () => {
			expect(
				await refusal({ phone: "670 00 00 02", channel: "cm.mtn" }),
			).toMatchObject({ code: "payment.selfPurchase", status: 403 });
		});

		it("does not count a member's number nobody verified", async () => {
			expect(
				(await pay({ phone: "+237655000003", channel: "cm.orange" })).status,
			).toBe("pending");
		});

		it("does not count a revoked member", async () => {
			use(seed());
			const revoked = payload.store["shop-members"]?.find(
				(m) => m.user === MANAGER,
			);
			if (revoked) revoked.status = "revoked";
			expect(
				(await pay({ phone: MANAGER_PHONE, channel: "cm.mtn" })).status,
			).toBe("pending");
		});
	});

	describe("rule 4: channel and phone", () => {
		it("a channel outside the market row → payment.channelUnsupported, even with a bad phone", async () => {
			use(seed({ settings: payments({}, { channels: ["cm.mtn"] }) }));
			expect(
				await refusal({ channel: "cm.orange", phone: "12" }),
			).toMatchObject({ code: "payment.channelUnsupported", status: 400 });
		});

		it("an unknown channel → payment.channelUnsupported", async () => {
			expect((await refusal({ channel: "cm.wave" })).code).toBe(
				"payment.channelUnsupported",
			);
		});

		it("a number from the other operator → phone.invalid", async () => {
			expect(await refusal({ channel: "cm.mtn" })).toMatchObject({
				code: "phone.invalid",
				status: 400,
			});
		});
	});

	describe("rule 5: attempts, replays and the payer phone", () => {
		it("an open intent under 3 minutes → 409 payment.attemptInProgress with its id, even at the third attempt", async () => {
			use(
				seed({
					order: { paymentStatus: "awaiting_payment" },
					extra: {
						"payment-intents": [
							intentDoc("pi-1"),
							intentDoc("pi-2", { attempt: 2 }),
							intentDoc("pi-3", {
								attempt: 3,
								status: "pending",
								failureCode: null,
								createdAt: new Date(NOW.getTime() - 2 * MIN).toISOString(),
							}),
						],
					},
				}),
			);
			expect(await refusal()).toEqual({
				code: "payment.attemptInProgress",
				status: 409,
				details: { intentId: "pi-3" },
			});
		});

		it("an open intent of 3 minutes no longer blocks a new attempt", async () => {
			use(
				seed({
					order: { paymentStatus: "awaiting_payment" },
					extra: {
						"payment-intents": [
							intentDoc("pi-1", {
								status: "pending",
								failureCode: null,
								createdAt: new Date(NOW.getTime() - 3 * MIN).toISOString(),
							}),
						],
					},
				}),
			);
			expect((await pay()).attempt).toBe(2);
		});

		it("three attempts → payment.tooManyAttempts, even when this phone also failed three times", async () => {
			use(
				seed({
					order: { paymentStatus: "awaiting_payment" },
					extra: {
						"payment-intents": [
							intentDoc("pi-1"),
							intentDoc("pi-2", { attempt: 2 }),
							intentDoc("pi-3", { attempt: 3 }),
						],
					},
				}),
			);
			expect(await refusal()).toMatchObject({
				code: "payment.tooManyAttempts",
				status: 409,
			});
		});

		it("three failed intents for the payer phone within the hour → 429 generic.rateLimited", async () => {
			const elsewhere = (id: string, minutesAgo: number) =>
				intentDoc(id, {
					targetId: "o-other",
					createdAt: new Date(NOW.getTime() - minutesAgo * MIN).toISOString(),
				});
			use(
				seed({
					extra: {
						"payment-intents": [
							elsewhere("pi-a", 50),
							elsewhere("pi-b", 30),
							elsewhere("pi-c", 10),
						],
					},
				}),
			);
			expect(await refusal()).toMatchObject({
				code: "generic.rateLimited",
				status: 429,
			});
		});

		it("does not count failures older than an hour or caused by the provider", async () => {
			use(
				seed({
					extra: {
						"payment-intents": [
							intentDoc("pi-a", {
								targetId: "o-other",
								createdAt: new Date(NOW.getTime() - 61 * MIN).toISOString(),
							}),
							intentDoc("pi-b", {
								targetId: "o-other",
								failureCode: "provider_error",
							}),
							intentDoc("pi-c", { targetId: "o-other" }),
							intentDoc("pi-d", { targetId: "o-other" }),
						],
					},
				}),
			);
			expect((await pay()).status).toBe("pending");
		});

		it("the same Idempotency-Key returns the existing intent and charges once", async () => {
			const first = await pay();
			const second = await pay();
			expect(second).toEqual({ ...first, instructions: null });
			expect(intents()).toHaveLength(1);
			expect(fake.callsTo("createDestinationCharge")).toHaveLength(1);
		});

		it("a replayed key whose intent failed at the provider answers payment.providerUnavailable again", async () => {
			fake.failWhen("chargeMobileMoney", { times: 1 });
			expect((await refusal()).code).toBe("payment.providerUnavailable");
			expect(await refusal()).toMatchObject({
				code: "payment.providerUnavailable",
				status: 503,
			});
			expect(intents()).toHaveLength(1);
		});

		it("two simultaneous first attempts yield one intent: one winner, one 409 naming it", async () => {
			const [a, b] = await Promise.allSettled([
				pay({ idempotencyKey: KEY }),
				pay({ idempotencyKey: KEY_2 }),
			]);
			const outcomes = [a, b];
			const won = outcomes.filter((o) => o.status === "fulfilled");
			const lost = outcomes.filter((o) => o.status === "rejected");
			expect(won).toHaveLength(1);
			expect(lost).toHaveLength(1);
			expect(intents()).toHaveLength(1);
			const winner = (won[0] as PromiseFulfilledResult<PaymentIntentResponse>)
				.value;
			expect(winner.intentId).toBe(String(intents()[0]?.id));
			expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({
				code: "payment.attemptInProgress",
				status: 409,
				details: { intentId: winner.intentId },
			});
			expect(fake.callsTo("createDestinationCharge")).toHaveLength(1);
			expect(payload.store["order-events"] ?? []).toHaveLength(1);
		});

		it("two simultaneous requests under one key yield one intent and the same answer", async () => {
			const [a, b] = await Promise.all([pay(), pay()]);
			expect(intents()).toHaveLength(1);
			expect(a.intentId).toBe(b.intentId);
		});
	});

	describe("rule 6: one transaction", () => {
		it("a failed order transition leaves no intent, no event and no provider call", async () => {
			payload.failWhen = (method, args) =>
				method === "db.updateOne" && args.collection === "orders";
			await expect(pay()).rejects.toThrow("forced failure: db.updateOne");
			expect(intents()).toHaveLength(0);
			expect(payload.store["order-events"] ?? []).toHaveLength(0);
			const order = await orderNow();
			expect(order.paymentStatus).toBe("unpaid");
			expect(order.amounts?.applicationFee).toBeUndefined();
			expect(fake.calls).toHaveLength(0);
		});
	});

	describe("rule 7: the provider after commit", () => {
		it.each([
			"createDestinationCharge",
			"chargeMobileMoney",
		] as const)("%s down → intent failed with provider_error, payment.providerUnavailable", async (method) => {
			fake.failWhen(method);
			expect(await refusal()).toMatchObject({
				code: "payment.providerUnavailable",
				status: 503,
			});
			expect(intents()).toHaveLength(1);
			expect(intents()[0]).toMatchObject({
				status: "failed",
				failureCode: "provider_error",
			});
			expect(
				(intents()[0]?.statusHistory as Array<{ status: string }>).map(
					(h) => h.status,
				),
			).toEqual(["created", "failed"]);
			// The order keeps its transition: the next attempt starts from it.
			expect((await orderNow()).paymentStatus).toBe("awaiting_payment");
		});

		it("keeps the provider's reference when only the push failed", async () => {
			fake.failWhen("chargeMobileMoney");
			await refusal();
			expect(intents()[0]?.providerReference).toBe("pay_1");
		});
	});
});

describe("paymentStatusView", () => {
	const viewer = (id: string, role = "user") => ({ id, role });

	it("shows the buyer the latest attempt, whole", async () => {
		const created = await pay();
		const view = await paymentStatusView(
			payload,
			await orderNow(),
			viewer(BUYER),
			{
				provider: fake,
				counterStore: new MemoryCounterStore(),
			},
		);
		expect(view).toEqual({
			orderPaymentStatus: "awaiting_payment",
			intent: {
				id: created.intentId,
				status: "pending",
				channel: "cm.orange",
				failureCode: null,
				expiresAt: created.expiresAt,
				attempt: 1,
				attemptsLeft: 2,
			},
		});
	});

	it("answers a null intent before any attempt", async () => {
		expect(
			await paymentStatusView(payload, await orderNow(), viewer(SHOP_STAFF)),
		).toEqual({ orderPaymentStatus: "unpaid", intent: null });
	});

	it("refuses a stranger with order.notFound", async () => {
		await expect(
			paymentStatusView(payload, await orderNow(), viewer(STRANGER)),
		).rejects.toMatchObject({ code: "order.notFound", status: 404 });
	});

	it("asks the provider only past 60 s pending, at most once per 20 s, and settles as the callback", async () => {
		await pay();
		const store = new MemoryCounterStore(() => Date.now());
		const look = async (atMs: number) => {
			vi.setSystemTime(new Date(NOW.getTime() + atMs));
			return paymentStatusView(payload, await orderNow(), viewer(BUYER), {
				provider: fake,
				counterStore: store,
			});
		};
		const verifies = () => fake.callsTo("verifyPayment").length;

		await look(59_000);
		expect(verifies()).toBe(0);
		await look(61_000);
		expect(verifies()).toBe(1);
		await look(66_000);
		expect(verifies()).toBe(1);
		await look(81_000);
		expect(verifies()).toBe(2);

		const reference = `PI-${intents()[0]?.id}`;
		expect(fake.callsTo("verifyPayment")).toEqual([[reference], [reference]]);
		expect(settleSpy.fn).toHaveBeenCalledWith(
			payload,
			expect.objectContaining({
				reference,
				status: "pending",
				source: "callback",
			}),
		);
	});

	it("answers the stored state when the provider poll fails", async () => {
		await pay();
		fake.failWhen("verifyPayment");
		vi.setSystemTime(new Date(NOW.getTime() + 2 * MIN));
		const view = await paymentStatusView(
			payload,
			await orderNow(),
			viewer(BUYER),
			{
				provider: fake,
				counterStore: new MemoryCounterStore(),
			},
		);
		expect(view.intent?.status).toBe("pending");
		expect(fake.callsTo("verifyPayment")).toHaveLength(1);
	});
});

describe("the routes", () => {
	const params = () => ({ params: Promise.resolve({ id: ORDER }) });

	function post(
		userId: string | null,
		headers: Record<string, string>,
		body: Doc,
	) {
		payload.auth.mockResolvedValue({ user: userId ? asUser(userId) : null });
		return POST(
			new Request(`http://x/api/orders/${ORDER}/payment-intents`, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			}),
			params(),
		);
	}

	it("POST answers 200 with the intent response", async () => {
		const res = await post(
			BUYER,
			{ "Idempotency-Key": KEY },
			{ channel: "cm.orange", phone: BUYER_PHONE },
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			intentId: String(intents()[0]?.id),
			status: "pending",
			expiresAt: new Date(NOW.getTime() + 30 * MIN).toISOString(),
			channel: "cm.orange",
			attempt: 1,
			attemptsLeft: 2,
			instructions: null,
		});
	});

	it("POST without a UUID Idempotency-Key is a 400 and creates nothing", async () => {
		const res = await post(
			BUYER,
			{ "Idempotency-Key": "not-a-uuid" },
			{ channel: "cm.orange", phone: BUYER_PHONE },
		);
		expect(res.status).toBe(400);
		expect((await res.json()).code).toBe("generic.badRequest");
		expect(intents()).toHaveLength(0);
	});

	it("POST signed out is a 401", async () => {
		const res = await post(null, { "Idempotency-Key": KEY }, {});
		expect(res.status).toBe(401);
	});

	it("POST on a missing order is order.notFound", async () => {
		payload.auth.mockResolvedValue({ user: asUser(BUYER) });
		const res = await POST(
			new Request("http://x/api/orders/nope/payment-intents", {
				method: "POST",
				headers: { "Idempotency-Key": KEY },
				body: JSON.stringify({ channel: "cm.orange", phone: BUYER_PHONE }),
			}),
			{ params: Promise.resolve({ id: "nope" }) },
		);
		expect(res.status).toBe(404);
		expect((await res.json()).code).toBe("order.notFound");
	});

	it("POST passes a refusal's code and details through", async () => {
		await pay();
		const res = await post(
			BUYER,
			{ "Idempotency-Key": KEY_2 },
			{ channel: "cm.orange", phone: BUYER_PHONE },
		);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({
			code: "payment.attemptInProgress",
			message: expect.any(String),
			details: { intentId: String(intents()[0]?.id) },
		});
	});

	it("GET answers a shop member the status view", async () => {
		await pay();
		payload.auth.mockResolvedValue({ user: asUser(MANAGER) });
		const res = await GET(
			new Request(`http://x/api/orders/${ORDER}/payment`),
			params(),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			orderPaymentStatus: "awaiting_payment",
			intent: { status: "pending", attempt: 1, attemptsLeft: 2 },
		});
	});
});
