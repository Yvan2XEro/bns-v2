// @vitest-environment node
import type { PayloadRequest } from "payload";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import type { AccountEvent } from "../../src/lib/payments/marketplace";
import type { ServiceUser } from "../../src/services/shops";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

/**
 * Runs the real service and routes against the in-memory Payload fake and the
 * fake marketplace. Only three seams are doubled: `getPayload` (so
 * `requireUser` resolves the fake), the registry (so the routes reach the
 * fake provider), and the two sibling services — `createHold` (Task 11) and
 * the payment notifications (Task 21) — whose exact calls are the contract.
 */
const { getPayloadMock, registry, holds, notifications } = vi.hoisted(() => ({
	getPayloadMock: vi.fn(),
	registry: { provider: null as unknown },
	holds: {
		createHold: vi.fn(
			async (
				req: { payload: { create: (args: unknown) => Promise<unknown> } },
				input: Record<string, unknown>,
			) =>
				req.payload.create({
					collection: "payout-holds",
					data: { ...input, status: "active", until: input.until ?? null },
					overrideAccess: true,
				}),
		),
	},
	notifications: {
		notifyConnectedAccountLost: vi.fn(async () => undefined),
		notifyPaymentsOnboardingAction: vi.fn(async () => undefined),
	},
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
vi.mock("../../src/lib/payments/marketplaceRegistry", () => ({
	getMarketplaceProvider: () => registry.provider,
}));
vi.mock("../../src/services/payoutHolds", () => ({
	createHold: holds.createHold,
}));
vi.mock("../../src/services/paymentNotifications", () => notifications);

import { POST } from "../../src/app/(frontend)/api/shops/[id]/payments/onboarding/route";
import { GET } from "../../src/app/(frontend)/api/shops/[id]/payments/setup/route";
import { runSyncConnectedAccount } from "../../src/jobs/syncConnectedAccount";
import { ERROR_CODES } from "../../src/lib/errors";
import { requireUser } from "../../src/lib/shopRoute";
import { withTransaction } from "../../src/lib/transactions";
import {
	applyAccountEvent,
	type PaymentSetupView,
	paymentSetupView,
} from "../../src/services/connectedAccounts";

const NOW = new Date("2026-10-03T10:00:00.000Z");
const SHOP = "shop-1";
const OWNER = "u-owner";
const MANAGER = "u-manager";
const SHOP_STAFF = "u-staff";
const STRANGER = "u-stranger";
const MODERATOR = "u-mod";

const GATES = ["G1", "G2", "G3", "G4", "G5", "G6"].map((gate) => ({
	gate,
	clearedAt: "2026-09-30T00:00:00.000Z",
	clearedBy: "admin",
	evidence: `ev-${gate}`,
	note: null,
}));

function payments(
	overrides: {
		enabled?: boolean;
		marketEnabled?: boolean;
		releaseModel?: string;
	} = {},
) {
	return {
		protectedPayment: { enabled: overrides.enabled ?? true },
		releaseModel: overrides.releaseModel ?? "provider_hold",
		markets: [
			{
				countryCode: "CM",
				currency: "XAF",
				provider: "notchpay",
				settlementMode: "provider_split",
				channels: ["cm.mtn", "cm.orange"],
				vatRateBps: 1925,
				enabled: overrides.marketEnabled ?? true,
			},
		],
		gates: GATES,
	};
}

const userDoc = (id: string, extra: Doc = {}): Doc => ({
	id,
	email: `${id}@test.cm`,
	role: "user",
	...extra,
});

const member = (user: string, role: string): Doc => ({
	id: `m-${user}`,
	shop: SHOP,
	user,
	role,
	status: "active",
});

function seed(
	shop: Doc = {},
	settings: ReturnType<typeof payments> = payments(),
	extra: Record<string, Doc[]> = {},
): FakePayload {
	return fakePayload(
		{
			users: [
				userDoc(OWNER, {
					phone: "+237670000001",
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
				}),
				userDoc(MANAGER),
				userDoc(SHOP_STAFF),
				userDoc(STRANGER),
				userDoc(MODERATOR, { role: "moderator" }),
			],
			shops: [
				{
					id: SHOP,
					name: "Boutique Wax",
					handle: "boutique-wax",
					owner: OWNER,
					status: "active",
					level: 2,
					location: { countryCode: "CM" },
					...shop,
				},
			],
			"shop-members": [
				member(OWNER, "owner"),
				member(MANAGER, "manager"),
				member(SHOP_STAFF, "staff"),
			],
			...extra,
		},
		{
			uniques: { "connected-accounts": [["shop", "provider"]] },
			globals: { "app-settings": { payments: settings } },
		},
	);
}

const asUser = (id: string): ServiceUser => ({
	id,
	role: id === MODERATOR ? "moderator" : "user",
	name: null,
	email: `${id}@test.cm`,
	suspendedAt: null,
	suspendedUntil: null,
});

let payload: FakePayload;
let fake: FakeMarketplaceProvider;

function use(p: FakePayload, userId: string | null = OWNER) {
	payload = p;
	payload.auth.mockResolvedValue({ user: userId ? asUser(userId) : null });
	getPayloadMock.mockResolvedValue(payload);
}

const params = () => ({ params: Promise.resolve({ id: SHOP }) });

async function onboard(userId: string, body: Doc = {}) {
	payload.auth.mockResolvedValue({ user: asUser(userId) });
	return POST(
		new Request(`http://x/api/shops/${SHOP}/payments/onboarding`, {
			method: "POST",
			body: JSON.stringify(body),
		}),
		params(),
	);
}

async function setup(userId: string) {
	payload.auth.mockResolvedValue({ user: asUser(userId) });
	return GET(
		new Request(`http://x/api/shops/${SHOP}/payments/setup`),
		params(),
	);
}

const view = async () =>
	paymentSetupView(
		payload,
		await payload.findByID({ collection: "shops", id: SHOP }),
		asUser(OWNER),
		NOW,
	);

// `requireUser` imports `@payload-config` lazily, and that first load is slow
// enough to eat a whole test timeout on a busy machine; pay it here instead.
beforeAll(async () => {
	getPayloadMock.mockResolvedValue(fakePayload());
	await requireUser(new Request("http://x"));
}, 60_000);

beforeEach(() => {
	vi.stubEnv("PROTECTED_PAYMENT_ALLOWED", "true");
	vi.stubEnv("PUBLIC_WEB_URL", "https://web.test");
	fake = new FakeMarketplaceProvider({ now: () => NOW });
	registry.provider = fake;
	holds.createHold.mockClear();
	notifications.notifyConnectedAccountLost.mockClear();
	notifications.notifyPaymentsOnboardingAction.mockClear();
	use(seed());
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("POST /api/shops/{id}/payments/onboarding", () => {
	it("creates the express account once for the owner and returns a fresh link", async () => {
		const res = await onboard(OWNER);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			url: "https://fake-provider.test/onboarding/acct_1/1",
		});
		expect(fake.callsTo("createConnectedAccount")).toEqual([
			[
				{
					shopId: SHOP,
					name: "Boutique Wax",
					email: `${OWNER}@test.cm`,
					phone: "+237670000001",
					type: "express",
				},
			],
		]);
		expect(fake.callsTo("setPayoutSchedule")).toEqual([["acct_1", "manual"]]);
		expect(fake.callsTo("createOnboardingLink")).toEqual([
			[
				"acct_1",
				{
					returnUrl: "https://web.test/seller/payments/setup?onboarding=done",
					refreshUrl: "https://web.test/seller/payments/setup",
				},
			],
		]);
		expect(
			payload.store["connected-accounts"].map((row) => ({
				shop: row.shop,
				provider: row.provider,
				providerAccountId: row.providerAccountId,
				accountType: row.accountType,
				status: row.status,
				payoutSchedule: row.payoutSchedule,
			})),
		).toEqual([
			{
				shop: SHOP,
				provider: "notchpay",
				providerAccountId: "acct_1",
				accountType: "express",
				status: "created",
				payoutSchedule: "manual",
			},
		]);
	});

	it("a second call reuses the account: one createConnectedAccount, a new link", async () => {
		await onboard(OWNER);
		const res = await onboard(OWNER, { platform: "mobile" });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			url: "https://fake-provider.test/onboarding/acct_1/2",
		});
		expect(fake.callsTo("createConnectedAccount")).toHaveLength(1);
		expect(fake.callsTo("setPayoutSchedule")).toHaveLength(1);
		expect(fake.callsTo("createOnboardingLink")[1]).toEqual([
			"acct_1",
			{
				returnUrl: "buynsellem://seller/payments/setup",
				refreshUrl: "buynsellem://seller/payments/setup",
			},
		]);
		expect(payload.store["connected-accounts"]).toHaveLength(1);
		expect(payload.store["connected-accounts"][0].providerAccountId).toBe(
			"acct_1",
		);
	});

	it("puts a provider_schedule market's account on the weekly schedule", async () => {
		use(seed({}, payments({ releaseModel: "provider_schedule" })));
		const res = await onboard(OWNER);

		expect(res.status).toBe(200);
		expect(fake.callsTo("setPayoutSchedule")).toEqual([["acct_1", "weekly"]]);
		expect(payload.store["connected-accounts"][0].payoutSchedule).toBe(
			"weekly",
		);
	});

	it.each([
		[MANAGER, "a manager"],
		[SHOP_STAFF, "a shop staff member"],
		[MODERATOR, "platform staff, who may read the setup but not onboard"],
	])("refuses %s (%s) with payout.ownerOnly", async (userId) => {
		const res = await onboard(userId);

		expect(res.status).toBe(403);
		expect((await res.json()).code).toBe(ERROR_CODES.payoutOwnerOnly);
		expect(fake.calls).toHaveLength(0);
	});

	it.each([
		[STRANGER, "a stranger"],
	])("answers %s (%s) with shop.notFound", async (userId) => {
		const res = await onboard(userId);

		expect(res.status).toBe(404);
		expect((await res.json()).code).toBe(ERROR_CODES.shopNotFound);
		expect(fake.calls).toHaveLength(0);
	});

	describe("eligibility, refused in the spec's order", () => {
		it("flag off → payment.protectedDisabled, though the market and the shop also fail", async () => {
			use(
				seed({ level: 1 }, payments({ enabled: false, marketEnabled: false })),
			);
			const res = await onboard(OWNER);

			expect(res.status).toBe(403);
			expect((await res.json()).code).toBe(
				ERROR_CODES.paymentProtectedDisabled,
			);
			expect(fake.calls).toHaveLength(0);
		});

		it("flag on but PROTECTED_PAYMENT_ALLOWED withdrawn → payment.protectedDisabled", async () => {
			vi.stubEnv("PROTECTED_PAYMENT_ALLOWED", "");
			const res = await onboard(OWNER);

			expect((await res.json()).code).toBe(
				ERROR_CODES.paymentProtectedDisabled,
			);
			expect(fake.calls).toHaveLength(0);
		});

		it("flag on, market off → payment.marketUnavailable, though the shop also fails", async () => {
			use(seed({ level: 1 }, payments({ marketEnabled: false })));
			const res = await onboard(OWNER);

			expect(res.status).toBe(400);
			expect((await res.json()).code).toBe(
				ERROR_CODES.paymentMarketUnavailable,
			);
			expect(fake.calls).toHaveLength(0);
		});

		it("a shop in a country with no market row → payment.marketUnavailable", async () => {
			use(seed({ location: { countryCode: "SN" } }));
			const res = await onboard(OWNER);

			expect((await res.json()).code).toBe(
				ERROR_CODES.paymentMarketUnavailable,
			);
		});

		it.each<[Doc, string]>([
			[{ level: 1 }, "level 1"],
			[{ status: "suspended" }, "a suspended shop"],
		])("flag and market on, %o (%s) → payment.shopNotEligible", async (shop) => {
			use(seed(shop));
			const res = await onboard(OWNER);

			expect(res.status).toBe(403);
			expect((await res.json()).code).toBe(ERROR_CODES.paymentShopNotEligible);
			expect(fake.calls).toHaveLength(0);
		});
	});
});

const accountRow = (overrides: Doc = {}): Doc => ({
	id: "ca-1",
	shop: SHOP,
	provider: "notchpay",
	providerAccountId: "acct_seed",
	accountType: "express",
	status: "active",
	chargesEnabled: true,
	payoutsEnabled: true,
	requirementsDue: [],
	payoutSchedule: "manual",
	lastSyncedAt: "2026-10-01T00:00:00.000Z",
	...overrides,
});

const accountEvent = (status: AccountEvent["status"]): AccountEvent => ({
	entity: "account",
	type: `account/${status}`,
	providerEventId: `evt_${status}`,
	reference: "",
	amount: null,
	currency: null,
	providerTransactionId: null,
	status,
	accountId: "acct_seed",
});

const apply = (event: AccountEvent) =>
	withTransaction(payload, (req: PayloadRequest) =>
		applyAccountEvent(req, event, { provider: fake, now: NOW }),
	);

describe("applyAccountEvent", () => {
	beforeEach(() => {
		use(seed({}, payments(), { "connected-accounts": [accountRow()] }));
		fake.seedAccount({ accountId: "acct_seed" });
	});

	it("account/deauthorized blocks charges with a shop hold, notifies, and the view shows it", async () => {
		await apply(accountEvent("deauthorized"));

		expect(holds.createHold.mock.calls.map(([, input]) => input)).toEqual([
			{
				scope: "shop",
				shop: SHOP,
				reason: "fraud_signal",
				blocksCharges: true,
				createdByType: "system",
			},
		]);
		expect(
			notifications.notifyConnectedAccountLost.mock.calls.map(
				(call: unknown[]) => call[1],
			),
		).toEqual([{ shopId: SHOP, status: "deauthorized" }]);
		expect(fake.callsTo("getConnectedAccount")).toEqual([]);

		expect(await view()).toEqual({
			flagEnabled: true,
			eligible: true,
			ineligibleReason: null,
			connectedAccount: {
				status: "deauthorized",
				chargesEnabled: false,
				payoutsEnabled: false,
				requirementsDue: [],
				lastSyncedAt: NOW.toISOString(),
			},
			payoutAccount: null,
			pendingAccount: null,
			holds: [{ scope: "shop", reasonCategory: "security", until: null }],
			changeCooldownUntil: null,
		} satisfies PaymentSetupView);
	});

	it("account/disabled blocks charges the same way", async () => {
		await apply(accountEvent("disabled"));

		expect(holds.createHold).toHaveBeenCalledTimes(1);
		expect(holds.createHold.mock.calls[0][1]).toMatchObject({
			reason: "fraud_signal",
			blocksCharges: true,
		});
		expect(payload.store["connected-accounts"][0].status).toBe("disabled");
	});

	it("a replayed deauthorization notifies once", async () => {
		await apply(accountEvent("deauthorized"));
		await apply(accountEvent("deauthorized"));

		expect(notifications.notifyConnectedAccountLost).toHaveBeenCalledTimes(1);
		expect(payload.store["connected-accounts"][0].status).toBe("deauthorized");
	});

	it("account/restricted re-reads the provider and writes its flags and requirements", async () => {
		fake.seedAccount({
			accountId: "acct_seed",
			status: "restricted",
			chargesEnabled: true,
			payoutsEnabled: false,
			requirementsDue: ["individual.id_number"],
			kycStatus: "pending",
			kycName: "Awa Ngono",
		});
		await apply(accountEvent("restricted"));

		expect(fake.callsTo("getConnectedAccount")).toEqual([["acct_seed"]]);
		const row = payload.store["connected-accounts"][0];
		expect({
			status: row.status,
			chargesEnabled: row.chargesEnabled,
			payoutsEnabled: row.payoutsEnabled,
			requirementsDue: row.requirementsDue,
			kycStatus: row.kycStatus,
			kycName: row.kycName,
			lastSyncedAt: row.lastSyncedAt,
		}).toEqual({
			status: "restricted",
			chargesEnabled: true,
			payoutsEnabled: false,
			requirementsDue: ["individual.id_number"],
			kycStatus: "pending",
			kycName: "Awa Ngono",
			lastSyncedAt: NOW.toISOString(),
		});
		expect(holds.createHold).not.toHaveBeenCalled();
		expect(notifications.notifyConnectedAccountLost).not.toHaveBeenCalled();
		expect(
			notifications.notifyPaymentsOnboardingAction.mock.calls.map(
				(call: unknown[]) => call[1],
			),
		).toEqual([
			{
				shopId: SHOP,
				status: "restricted",
				requirementsDue: ["individual.id_number"],
			},
		]);
	});

	it("tells the owner about a restriction once, not on every replay", async () => {
		fake.seedAccount({ accountId: "acct_seed", status: "restricted" });
		await apply(accountEvent("restricted"));
		await apply(accountEvent("restricted"));

		expect(payload.store["connected-accounts"][0].status).toBe("restricted");
		expect(notifications.notifyPaymentsOnboardingAction).toHaveBeenCalledTimes(
			1,
		);
	});

	it("tells the owner when an active account starts owing requirements", async () => {
		fake.seedAccount({
			accountId: "acct_seed",
			status: "active",
			requirementsDue: ["tos_acceptance"],
		});
		await apply(accountEvent("active"));

		expect(
			notifications.notifyPaymentsOnboardingAction.mock.calls.map(
				(call: unknown[]) => call[1],
			),
		).toEqual([
			{ shopId: SHOP, status: "active", requirementsDue: ["tos_acceptance"] },
		]);
	});

	it("does not call onboarding requirements an action notice", async () => {
		use(
			seed({}, payments(), {
				"connected-accounts": [accountRow({ status: "onboarding" })],
			}),
		);
		fake.seedAccount({
			accountId: "acct_seed",
			status: "onboarding",
			requirementsDue: ["individual.id_number"],
		});
		await apply(accountEvent("onboarding"));

		expect(payload.store["connected-accounts"][0].requirementsDue).toEqual([
			"individual.id_number",
		]);
		expect(notifications.notifyPaymentsOnboardingAction).toHaveBeenCalledTimes(
			0,
		);
	});

	it("ignores an account it does not know, and writes nothing", async () => {
		const before = structuredClone(payload.store["connected-accounts"]);
		const result = await apply({
			...accountEvent("deauthorized"),
			accountId: "acct_other",
		});

		expect(result).toBeNull();
		expect(payload.store["connected-accounts"]).toEqual(before);
		expect(holds.createHold).not.toHaveBeenCalled();
	});
});

describe("syncConnectedAccount job", () => {
	it("sweeps onboarding and restricted rows only", async () => {
		use(
			seed({}, payments(), {
				"connected-accounts": [
					accountRow({
						id: "ca-a",
						providerAccountId: "acct_a",
						status: "onboarding",
					}),
					accountRow({
						id: "ca-b",
						shop: "shop-2",
						providerAccountId: "acct_b",
						status: "restricted",
					}),
					accountRow({
						id: "ca-c",
						shop: "shop-3",
						providerAccountId: "acct_c",
						status: "active",
					}),
				],
			}),
		);
		fake.seedAccount({ accountId: "acct_a", status: "active" });
		fake.seedAccount({
			accountId: "acct_b",
			status: "restricted",
			requirementsDue: ["tos_acceptance"],
		});
		fake.seedAccount({ accountId: "acct_c", status: "active" });

		const out = await withTransaction(payload, (req: PayloadRequest) =>
			runSyncConnectedAccount(req, {}, fake),
		);

		expect(out).toEqual({ synced: 2, failed: 0 });
		expect(fake.callsTo("getConnectedAccount")).toEqual([
			["acct_a"],
			["acct_b"],
		]);
		expect(
			payload.store["connected-accounts"].map((row) => [
				row.id,
				row.status,
				row.requirementsDue,
			]),
		).toEqual([
			["ca-a", "active", []],
			["ca-b", "restricted", ["tos_acceptance"]],
			["ca-c", "active", []],
		]);
	});
});

describe("paymentSetupView", () => {
	it("no account yet", async () => {
		expect(await view()).toEqual({
			flagEnabled: true,
			eligible: true,
			ineligibleReason: null,
			connectedAccount: null,
			payoutAccount: null,
			pendingAccount: null,
			holds: [],
			changeCooldownUntil: null,
		} satisfies PaymentSetupView);
	});

	it("onboarding, with a payout account pending review, flag off and level 1", async () => {
		use(
			seed({ level: 1 }, payments({ enabled: false }), {
				"connected-accounts": [
					accountRow({
						status: "onboarding",
						chargesEnabled: false,
						payoutsEnabled: false,
						requirementsDue: [],
					}),
				],
				"payout-accounts": [
					{
						id: "pa-1",
						shop: SHOP,
						method: "mtn_momo",
						accountName: "Awa Ngono",
						accountNumber: "+237670000001",
						accountNumberMasked: "+237 6•• •• •0 01",
						status: "pending_review",
					},
				],
			}),
		);

		expect(await view()).toEqual({
			flagEnabled: false,
			eligible: false,
			ineligibleReason: "level",
			connectedAccount: {
				status: "onboarding",
				chargesEnabled: false,
				payoutsEnabled: false,
				requirementsDue: [],
				lastSyncedAt: "2026-10-01T00:00:00.000Z",
			},
			payoutAccount: null,
			pendingAccount: {
				method: "mtn_momo",
				accountNumberMasked: "+237 6•• •• •0 01",
				status: "pending_review",
			},
			holds: [],
			changeCooldownUntil: null,
		} satisfies PaymentSetupView);
	});

	it("active with requirements due, an active payout account inside its cooldown", async () => {
		use(
			seed({}, payments({ marketEnabled: false }), {
				"connected-accounts": [
					accountRow({ requirementsDue: ["external_account", 7] }),
				],
				"payout-accounts": [
					{
						id: "pa-old",
						shop: SHOP,
						method: "orange_money",
						accountName: "Awa Ngono",
						accountNumber: "+237690000001",
						accountNumberMasked: "+237 6•• •• •0 01",
						status: "replaced",
						activatedAt: "2026-09-01T00:00:00.000Z",
					},
					{
						id: "pa-1",
						shop: SHOP,
						method: "mtn_momo",
						accountName: "Awa Ngono",
						accountNumber: "+237670000001",
						accountNumberMasked: "+237 6•• •• •0 01",
						status: "active",
						activatedAt: "2026-10-01T10:00:00.000Z",
					},
				],
			}),
		);

		expect(await view()).toEqual({
			flagEnabled: false,
			eligible: false,
			ineligibleReason: "market",
			connectedAccount: {
				status: "active",
				chargesEnabled: true,
				payoutsEnabled: true,
				requirementsDue: ["external_account"],
				lastSyncedAt: "2026-10-01T00:00:00.000Z",
			},
			payoutAccount: {
				method: "mtn_momo",
				accountName: "Awa Ngono",
				accountNumberMasked: "+237 6•• •• •0 01",
				status: "active",
				activatedAt: "2026-10-01T10:00:00.000Z",
			},
			pendingAccount: null,
			holds: [],
			changeCooldownUntil: "2026-10-08T10:00:00.000Z",
		} satisfies PaymentSetupView);
	});

	it("shows a hold's category, never its reason", async () => {
		use(
			seed({}, payments(), {
				"connected-accounts": [accountRow()],
				"payout-holds": [
					{
						id: "h-1",
						scope: "shop",
						shop: SHOP,
						reason: "fraud_signal",
						blocksCharges: true,
						status: "active",
						until: null,
						createdByType: "system",
						note: "refund rate 14% over 30 days",
						createdAt: "2026-10-02T00:00:00.000Z",
					},
					{
						id: "h-2",
						scope: "order",
						shop: SHOP,
						order: "o-1",
						reason: "dispute_open",
						status: "active",
						until: "2026-10-10T00:00:00.000Z",
						createdByType: "system",
						createdAt: "2026-10-02T01:00:00.000Z",
					},
					{
						id: "h-3",
						scope: "shop",
						shop: SHOP,
						reason: "payout_failed_repeatedly",
						status: "released",
						until: null,
						createdByType: "system",
						createdAt: "2026-09-01T00:00:00.000Z",
					},
				],
			}),
		);
		const result = await view();

		expect(result.holds).toEqual([
			{ scope: "shop", reasonCategory: "security", until: null },
			{
				scope: "order",
				reasonCategory: "review",
				until: "2026-10-10T00:00:00.000Z",
			},
		]);
		const json = JSON.stringify(result);
		expect(json).toContain('"reasonCategory":"security"');
		expect(json).not.toContain("fraud_signal");
		expect(json).not.toContain("dispute_open");
		expect(json).not.toContain("refund rate");
	});
});

describe("GET /api/shops/{id}/payments/setup", () => {
	it.each([
		OWNER,
		MANAGER,
		MODERATOR,
	])("serves %s the whole view", async (userId) => {
		const res = await setup(userId);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			flagEnabled: true,
			eligible: true,
			ineligibleReason: null,
			connectedAccount: null,
			payoutAccount: null,
			pendingAccount: null,
			holds: [],
			changeCooldownUntil: null,
		});
	});

	it("refuses a shop staff member with shop.forbidden", async () => {
		const res = await setup(SHOP_STAFF);

		expect(res.status).toBe(403);
		expect((await res.json()).code).toBe(ERROR_CODES.shopForbidden);
	});

	it("answers a stranger with shop.notFound", async () => {
		const res = await setup(STRANGER);

		expect(res.status).toBe(404);
		expect((await res.json()).code).toBe(ERROR_CODES.shopNotFound);
	});
});

describe("GET /api/shops/{id}/payments/setup on the return from onboarding", () => {
	const returning = (userId: string, query = "?onboarding=done") => {
		payload.auth.mockResolvedValue({ user: asUser(userId) });
		return GET(
			new Request(`http://x/api/shops/${SHOP}/payments/setup${query}`),
			params(),
		);
	};

	it.each([
		"onboarding",
		"restricted",
	])("queues a sync of a %s account on the payments queue", async (status) => {
		use(
			seed({}, payments(), { "connected-accounts": [accountRow({ status })] }),
		);

		const res = await returning(OWNER);

		expect(res.status).toBe(200);
		expect(payload.jobs.queue.mock.calls).toEqual([
			[
				{
					task: "syncConnectedAccount",
					queue: "payments",
					input: { connectedAccountId: "ca-1" },
				},
			],
		]);
	});

	it("queues nothing for an active account, or without the return marker", async () => {
		use(seed({}, payments(), { "connected-accounts": [accountRow()] }));
		const active = await returning(OWNER);
		const queuedForActive = payload.jobs.queue.mock.calls.length;
		use(
			seed({}, payments(), {
				"connected-accounts": [accountRow({ status: "onboarding" })],
			}),
		);
		const plain = await returning(OWNER, "");

		expect([active.status, plain.status]).toEqual([200, 200]);
		expect((await plain.json()).connectedAccount.status).toBe("onboarding");
		expect([queuedForActive, payload.jobs.queue.mock.calls.length]).toEqual([
			0, 0,
		]);
	});

	it("queues nothing for a caller the view refuses", async () => {
		use(
			seed({}, payments(), {
				"connected-accounts": [accountRow({ status: "onboarding" })],
			}),
		);

		const res = await returning(STRANGER);

		expect(res.status).toBe(404);
		expect(payload.jobs.queue.mock.calls).toHaveLength(0);
	});
});
