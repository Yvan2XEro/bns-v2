// @vitest-environment node
import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateHoldInput } from "../../src/services/payoutHolds";
import { fakePayload } from "./helpers/fakePayload";

/**
 * `services/payoutAccounts.ts` against the in-memory Payload fake, with the
 * P2 identity read for real: the owner's `identityVerification` points at an
 * approved level-2 request whose KYC names are the identity the payout
 * account must match. The two sibling seams are mocked: Task 11's
 * `createHold` (here it writes its row through the `req` it is handed, so a
 * rollback of that transaction is visible) and Task 21's notifiers.
 */

const { createHold, notify } = vi.hoisted(() => ({
	createHold: vi.fn(),
	notify: {
		notifyPayoutAccountActivated: vi.fn(async () => undefined),
		notifyPayoutAccountReview: vi.fn(async () => undefined),
		notifyPayoutAccountChanged: vi.fn(async () => undefined),
	},
}));
vi.mock("../../src/services/payoutHolds", () => ({ createHold }));
vi.mock("../../src/services/paymentNotifications", () => notify);

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const { maskAccountNumber, reportPayoutAccountNotMe, submitPayoutAccount } =
	await import("../../src/services/payoutAccounts");
const { POST: createRoute } = await import(
	"../../src/app/(frontend)/api/shops/[id]/payout-accounts/route"
);
const { POST: notMeRoute } = await import(
	"../../src/app/(frontend)/api/shops/[id]/payout-accounts/[accountId]/not-me/route"
);
const { GET: summaryRoute } = await import(
	"../../src/app/(frontend)/api/moderation/summary/route"
);

const NOW = new Date("2026-10-03T10:00:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) =>
	new Date(NOW.getTime() - days * DAY).toISOString();

const OWNER = { id: "u-owner", role: "user", name: "Aïcha" };
const MANAGER = { id: "u-mgr", role: "user", name: "Bruno" };
const MOD = { id: "u-mod", role: "moderator", name: "Grâce" };

const MTN = "+237671234421";
const ORANGE = "+237691234455";

type Doc = Record<string, unknown>;

function world(
	over: { shop?: Doc; accounts?: Doc[]; identity?: Doc | null } = {},
) {
	const payload = fakePayload({
		users: [
			{
				...OWNER,
				identityVerifiedAt: ago(30),
				identityVerification: "vr-1",
			},
			MANAGER,
			MOD,
		],
		"verification-requests": [
			{
				id: "vr-1",
				shop: "s-1",
				submittedBy: OWNER.id,
				requestedLevel: 2,
				status: "approved",
				expiresAt: new Date(NOW.getTime() + 300 * DAY).toISOString(),
				kyc:
					over.identity === undefined
						? { givenNames: "Aïcha Ngo", familyName: "Mbappé" }
						: over.identity,
			},
		],
		shops: [
			{
				id: "s-1",
				name: "Akwa Tech",
				owner: OWNER.id,
				status: "active",
				level: 2,
				levelExpiresAt: null,
				updatedAt: ago(1),
				legal: {},
				...over.shop,
			},
		],
		"shop-members": [
			{
				id: "m-1",
				shop: "s-1",
				user: OWNER.id,
				role: "owner",
				status: "active",
			},
			{
				id: "m-2",
				shop: "s-1",
				user: MANAGER.id,
				role: "manager",
				status: "active",
			},
		],
		"payout-accounts": over.accounts ?? [],
	});
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

type World = ReturnType<typeof world>;

const rows = (payload: World, collection: string) =>
	(payload.store[collection] ?? []) as Doc[];

const input = (over: Partial<Doc> = {}) => ({
	method: "mtn_momo" as const,
	accountName: "Aicha Ngo Mbappe",
	accountNumber: MTN,
	...over,
});

/** An account activated `days` ago, created `createdDays` ago. */
const activeRow = (id: string, days: number, createdDays = days) => ({
	id,
	shop: "s-1",
	method: "orange_money",
	accountName: "Aicha Ngo Mbappe",
	accountNumber: ORANGE,
	accountNumberMasked: "+237 6•• •• •4 55",
	status: "active",
	activatedAt: ago(days),
	createdAt: ago(createdDays),
});

async function codeOf(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		const e = error as { code?: string; status?: number };
		return { code: e.code, status: e.status };
	}
	return { code: "resolved", status: 0 };
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	createHold.mockReset();
	createHold.mockImplementation(
		async (req: PayloadRequest, data: CreateHoldInput) =>
			req.payload.create({
				collection: "payout-holds",
				overrideAccess: true,
				req,
				data: { ...data, status: "active", blocksCharges: false },
			}),
	);
	for (const fn of Object.values(notify)) fn.mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("maskAccountNumber", () => {
	it("keeps the dial code, the first national digit and the last three", () => {
		expect(maskAccountNumber("mtn_momo", MTN)).toBe("+237 6•• •• •4 21");
		expect(maskAccountNumber("orange_money", ORANGE)).toBe("+237 6•• •• •4 55");
	});

	it("leaves only the last four digits of a RIB", () => {
		expect(maskAccountNumber("bank", "10005000010123456789012")).toBe(
			`${"•".repeat(19)}9012`,
		);
	});
});

/**
 * One case per code, in the spec's order. Each case passes every earlier gate
 * and also fails every later one, so it is the order itself that decides
 * which code answers — swapping two gates turns a case red.
 */
describe("the validation ladder", () => {
	it("1. a manager is refused with payout.ownerOnly", async () => {
		const payload = world({
			shop: { level: 1 },
			accounts: [activeRow("p-0", 1)],
		});
		expect(
			await codeOf(
				submitPayoutAccount(payload, MANAGER, "s-1", input({ method: "bank" })),
			),
		).toEqual({ code: "payout.ownerOnly", status: 403 });
		expect(rows(payload, "payout-accounts")).toHaveLength(1);
	});

	it("2. an owner below level 2 is refused with payment.shopNotEligible", async () => {
		const payload = world({
			shop: { level: 1 },
			accounts: [activeRow("p-0", 1)],
		});
		expect(
			await codeOf(
				submitPayoutAccount(payload, OWNER, "s-1", input({ method: "bank" })),
			),
		).toEqual({ code: "payment.shopNotEligible", status: 403 });
		expect(rows(payload, "payout-accounts")).toHaveLength(1);
	});

	it("2b. so is a level-2 shop whose level has expired, or whose identity names are gone", async () => {
		const expired = world({ shop: { levelExpiresAt: ago(1) } });
		expect(
			await codeOf(submitPayoutAccount(expired, OWNER, "s-1", input())),
		).toEqual({ code: "payment.shopNotEligible", status: 403 });
		const cleared = world({ identity: { givenNames: null, familyName: null } });
		expect(
			await codeOf(submitPayoutAccount(cleared, OWNER, "s-1", input())),
		).toEqual({ code: "payment.shopNotEligible", status: 403 });
	});

	it("3. a bank account is refused with payout.methodUnavailable", async () => {
		const payload = world({ accounts: [activeRow("p-0", 1)] });
		expect(
			await codeOf(
				submitPayoutAccount(
					payload,
					OWNER,
					"s-1",
					input({ method: "bank", accountNumber: "123" }),
				),
			),
		).toEqual({ code: "payout.methodUnavailable", status: 400 });
	});

	it("4. a number of another operator is refused with payout.accountInvalid", async () => {
		const payload = world({ accounts: [activeRow("p-0", 1)] });
		expect(
			await codeOf(
				submitPayoutAccount(
					payload,
					OWNER,
					"s-1",
					input({ accountNumber: ORANGE }),
				),
			),
		).toEqual({ code: "payout.accountInvalid", status: 400 });
		expect(
			await codeOf(
				submitPayoutAccount(
					payload,
					OWNER,
					"s-1",
					input({ accountNumber: "671234421" }),
				),
			),
		).toEqual({ code: "payout.accountInvalid", status: 400 });
	});

	it("5. a change within seven days of the last activation is refused with payout.accountChangeCooldown", async () => {
		const payload = world({ accounts: [activeRow("p-0", 1)] });
		await expect(
			submitPayoutAccount(
				payload,
				OWNER,
				"s-1",
				input({ accountName: "Paul Biya" }),
			),
		).rejects.toMatchObject({
			code: "payout.accountChangeCooldown",
			status: 409,
			details: { until: new Date(NOW.getTime() + 6 * DAY).toISOString() },
		});
		expect(rows(payload, "payout-accounts")).toHaveLength(1);
	});

	it("the cooldown runs from activation, not creation", async () => {
		// Created ten days ago, activated two days ago after review: still cooling.
		const late = world({ accounts: [activeRow("p-0", 2, 10)] });
		expect(
			await codeOf(submitPayoutAccount(late, OWNER, "s-1", input())),
		).toEqual({
			code: "payout.accountChangeCooldown",
			status: 409,
		});
		// Activated eight days ago: the change goes through.
		const done = world({ accounts: [activeRow("p-0", 8, 8)] });
		const view = await submitPayoutAccount(done, OWNER, "s-1", input());
		expect(view.status).toBe("active");
	});
});

describe("the name match verdicts", () => {
	it("match: the first account is active at once, masked, and opens no change hold", async () => {
		const payload = world();
		const view = await submitPayoutAccount(
			payload,
			OWNER,
			"s-1",
			input({ accountNumber: "+237 671 23 44 21" }),
		);

		const [row] = rows(payload, "payout-accounts");
		expect(view).toEqual({
			id: row.id,
			method: "mtn_momo",
			accountName: "Aicha Ngo Mbappe",
			accountNumberMasked: "+237 6•• •• •4 21",
			status: "active",
			nameMatch: "match",
			activatedAt: NOW.toISOString(),
			createdAt: row.createdAt,
		});
		expect(row).toMatchObject({
			accountNumber: MTN,
			createdBy: OWNER.id,
			nameMatch: {
				identityName: "Aïcha Ngo Mbappé",
				result: "match",
				checkedAt: NOW.toISOString(),
			},
		});
		expect(notify.notifyPayoutAccountActivated.mock.calls).toEqual([
			[
				payload,
				{
					shopId: "s-1",
					ownerId: OWNER.id,
					accountId: row.id,
					method: "mtn_momo",
					accountNumberMasked: "+237 6•• •• •4 21",
				},
			],
		]);
		expect(createHold).toHaveBeenCalledTimes(0);
		expect(notify.notifyPayoutAccountChanged).toHaveBeenCalledTimes(0);
	});

	it("partial: pending_review, counted by moderation/summary, and the owner is told", async () => {
		const payload = world();
		const view = await submitPayoutAccount(
			payload,
			OWNER,
			"s-1",
			input({ accountName: "Jean Mbappe" }),
		);
		expect(view).toMatchObject({
			status: "pending_review",
			nameMatch: "partial",
			activatedAt: null,
		});
		expect(notify.notifyPayoutAccountReview.mock.calls).toEqual([
			[
				payload,
				{
					shopId: "s-1",
					ownerId: OWNER.id,
					accountId: view.id,
					method: "mtn_momo",
					accountNumberMasked: "+237 6•• •• •4 21",
					result: "partial",
				},
			],
		]);

		payload.auth.mockResolvedValue({ user: MOD });
		const summary = await (
			await summaryRoute(new Request("http://x/api/moderation/summary"))
		).json();
		expect(summary).toMatchObject({ pendingPayoutAccounts: 1, total: 1 });
	});

	it("mismatch: the rejected row is kept and the caller gets payout.accountNameMismatch", async () => {
		const payload = world();
		const error = await submitPayoutAccount(
			payload,
			OWNER,
			"s-1",
			input({ accountName: "Paul Biya" }),
		).catch((e: unknown) => e);

		const [row] = rows(payload, "payout-accounts");
		expect(row).toMatchObject({
			status: "rejected",
			nameMatch: { result: "mismatch" },
		});
		expect(error).toMatchObject({
			code: "payout.accountNameMismatch",
			status: 422,
			details: {
				account: { id: row.id, status: "rejected", nameMatch: "mismatch" },
			},
		});
		expect(notify.notifyPayoutAccountReview).toHaveBeenCalledTimes(1);
		expect(notify.notifyPayoutAccountActivated).toHaveBeenCalledTimes(0);
	});

	it("a level-3 shop may also use its verified business name; a level-2 shop may not", async () => {
		const legal = { legalName: "Akwa Tech SARL", verifiedAt: ago(10) };
		const level3 = world({ shop: { level: 3, legal } });
		const view = await submitPayoutAccount(
			level3,
			OWNER,
			"s-1",
			input({ accountName: "AKWA TECH SARL" }),
		);
		expect(view.status).toBe("active");

		const level2 = world({ shop: { level: 2, legal } });
		expect(
			await codeOf(
				submitPayoutAccount(
					level2,
					OWNER,
					"s-1",
					input({ accountName: "AKWA TECH SARL" }),
				),
			),
		).toEqual({ code: "payout.accountNameMismatch", status: 422 });
	});
});

describe("a second activation", () => {
	it("replaces the previous row and opens the 72-hour change hold in the same transaction", async () => {
		const payload = world({ accounts: [activeRow("p-0", 10)] });
		const view = await submitPayoutAccount(payload, OWNER, "s-1", input());

		const accounts = rows(payload, "payout-accounts");
		expect(accounts.map((a) => [a.id, a.status, a.replacedAt ?? null])).toEqual(
			[
				["p-0", "replaced", NOW.toISOString()],
				[view.id, "active", null],
			],
		);

		const until = new Date(NOW.getTime() + 72 * 3_600_000).toISOString();
		expect(createHold).toHaveBeenCalledTimes(1);
		const [holdReq, holdInput] = createHold.mock.calls[0];
		expect(holdInput).toEqual({
			scope: "shop",
			shop: "s-1",
			reason: "payout_account_changed",
			until,
			createdByType: "system",
		});
		const accountWrite = payload.writes.find(
			(w) => w.op === "create" && w.collection === "payout-accounts",
		);
		expect(accountWrite?.transactionID).toBeTruthy();
		expect((holdReq as PayloadRequest).transactionID).toBe(
			accountWrite?.transactionID,
		);

		expect(notify.notifyPayoutAccountChanged.mock.calls).toEqual([
			[
				payload,
				{
					shopId: "s-1",
					ownerId: OWNER.id,
					accountId: view.id,
					method: "mtn_momo",
					accountNumberMasked: "+237 6•• •• •4 21",
					holdUntil: until,
					notMeUrl: `https://buynsellem.com/seller/payments/setup?shop=s-1&notMe=${view.id}`,
				},
			],
		]);
	});

	it("is atomic with its hold: a failure after both writes leaves neither", async () => {
		const payload = world({ accounts: [activeRow("p-0", 10)] });
		createHold.mockImplementationOnce(
			async (req: PayloadRequest, data: CreateHoldInput) => {
				await req.payload.create({
					collection: "payout-holds",
					overrideAccess: true,
					req,
					data: { ...data, status: "active" },
				});
				throw new Error("forced failure after the hold write");
			},
		);

		await expect(
			submitPayoutAccount(payload, OWNER, "s-1", input()),
		).rejects.toThrow("forced failure after the hold write");

		expect(createHold).toHaveBeenCalledTimes(1);
		expect(rows(payload, "payout-holds")).toHaveLength(0);
		expect(
			rows(payload, "payout-accounts").map((a) => [a.id, a.status]),
		).toEqual([["p-0", "active"]]);
		expect(notify.notifyPayoutAccountChanged).toHaveBeenCalledTimes(0);
	});
});

describe("one active account per shop", () => {
	it("two racing first accounts leave exactly one active row", async () => {
		const payload = world();
		const results = await Promise.allSettled([
			submitPayoutAccount(payload, OWNER, "s-1", input()),
			submitPayoutAccount(
				payload,
				OWNER,
				"s-1",
				input({ method: "orange_money", accountNumber: ORANGE }),
			),
		]);

		expect(results.map((r) => r.status).sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
		const loser = results.find(
			(r): r is PromiseRejectedResult => r.status === "rejected",
		);
		expect(loser?.reason).toMatchObject({
			code: "payout.accountChangeCooldown",
		});
		const active = rows(payload, "payout-accounts").filter(
			(a) => a.status === "active",
		);
		expect(active).toHaveLength(1);
		expect(rows(payload, "payout-accounts")).toHaveLength(1);
	});
});

describe("This was not me", () => {
	async function changed() {
		const payload = world({ accounts: [activeRow("p-0", 10)] });
		const view = await submitPayoutAccount(payload, OWNER, "s-1", input());
		return { payload, newId: view.id };
	}

	it("restores the previous account and escalates the hold to an open fraud_signal", async () => {
		const { payload, newId } = await changed();
		const result = await reportPayoutAccountNotMe(payload, OWNER, "s-1", newId);

		expect(result.restored).toMatchObject({ id: "p-0", status: "active" });
		expect(result.disowned).toMatchObject({ id: newId, status: "rejected" });
		expect(
			rows(payload, "payout-accounts").map((a) => [
				a.id,
				a.status,
				a.replacedAt ?? null,
			]),
		).toEqual([
			["p-0", "active", null],
			[newId, "rejected", null],
		]);
		const holds = rows(payload, "payout-holds");
		expect(holds).toHaveLength(1);
		expect(holds[0]).toMatchObject({
			scope: "shop",
			shop: "s-1",
			reason: "fraud_signal",
			status: "active",
			until: null,
			blocksCharges: true,
		});
	});

	it("is the owner's alone, and only for the active account", async () => {
		const { payload, newId } = await changed();
		expect(
			await codeOf(reportPayoutAccountNotMe(payload, MANAGER, "s-1", newId)),
		).toEqual({ code: "payout.ownerOnly", status: 403 });
		expect(
			await codeOf(reportPayoutAccountNotMe(payload, OWNER, "s-1", "p-0")),
		).toEqual({ code: "generic.validation", status: 409 });
		expect(
			await codeOf(reportPayoutAccountNotMe(payload, OWNER, "s-1", "nope")),
		).toEqual({ code: "generic.notFound", status: 404 });
		expect(rows(payload, "payout-holds")[0]).toMatchObject({
			reason: "payout_account_changed",
		});
	});
});

describe("the routes", () => {
	const params = (id: string) => ({ params: Promise.resolve({ id }) });
	const post = (body: unknown) =>
		new Request("http://localhost/x", {
			method: "POST",
			body: JSON.stringify(body),
		});

	it("POST /payout-accounts answers 201 with the masked row and never the number", async () => {
		const payload = world();
		payload.auth.mockResolvedValue({ user: OWNER });
		const response = await createRoute(post(input()), params("s-1"));

		expect(response.status).toBe(201);
		const body = await response.json();
		expect(Object.keys(body).sort()).toEqual([
			"accountName",
			"accountNumberMasked",
			"activatedAt",
			"createdAt",
			"id",
			"method",
			"nameMatch",
			"status",
		]);
		expect(body.accountNumberMasked).toBe("+237 6•• •• •4 21");
		expect(JSON.stringify(body)).not.toContain("671234421");
	});

	it("POST /payout-accounts answers the service's code and refuses a malformed body", async () => {
		const payload = world();
		payload.auth.mockResolvedValue({ user: MANAGER });
		const refused = await createRoute(post(input()), params("s-1"));
		expect(refused.status).toBe(403);
		expect((await refused.json()).code).toBe("payout.ownerOnly");

		payload.auth.mockResolvedValue({ user: OWNER });
		const malformed = await createRoute(
			post({ ...input(), method: "cash" }),
			params("s-1"),
		);
		expect(malformed.status).toBe(400);
		expect((await malformed.json()).code).toBe("generic.validation");
		expect(rows(payload, "payout-accounts")).toHaveLength(0);
	});

	it("POST /not-me reverts for the owner", async () => {
		const payload = world({ accounts: [activeRow("p-0", 10)] });
		const view = await submitPayoutAccount(payload, OWNER, "s-1", input());
		payload.auth.mockResolvedValue({ user: OWNER });

		const response = await notMeRoute(
			new Request("http://localhost/x", { method: "POST" }),
			{
				params: Promise.resolve({ id: "s-1", accountId: view.id }),
			},
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect([body.restored.id, body.restored.status]).toEqual(["p-0", "active"]);
		expect([body.disowned.id, body.disowned.status]).toEqual([
			view.id,
			"rejected",
		]);
	});
});
