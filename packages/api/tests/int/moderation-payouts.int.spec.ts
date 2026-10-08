// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayoutHoldReason } from "../../src/collections/PayoutHolds";
import { type Doc, fakePayload } from "./helpers/fakePayload";

/**
 * Staff's hands on a shop's money (Task 19): `holdPayouts`, the rank ladder of
 * `releasePayoutHold`, the payout-account review and the shop sheet's
 * `payments` block, against the in-memory fake with the real hold and payout
 * account services underneath. Only the notifiers are doubled.
 */

const { notify } = vi.hoisted(() => ({
	notify: {
		notifyPayoutHoldPlaced: vi.fn(async () => undefined),
		notifyPayoutHoldReleased: vi.fn(async () => undefined),
		notifyPayoutAccountActivated: vi.fn(async () => undefined),
		notifyPayoutAccountChanged: vi.fn(async () => undefined),
		notifyPayoutAccountReview: vi.fn(async () => undefined),
	},
}));
vi.mock("../../src/services/paymentNotifications", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/paymentNotifications")
	>()),
	...notify,
}));

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const {
	approvePayoutAccount,
	holdPayouts,
	rejectPayoutAccount,
	releasePayoutHold,
} = await import("../../src/services/moderation");
const { revertPayoutAccount } = await import(
	"../../src/services/payoutAccounts"
);
const { withTransaction } = await import("../../src/lib/transactions");
const { POST: payoutsRoute } = await import(
	"../../src/app/(frontend)/api/moderation/shops/[id]/payouts/route"
);
const { GET: sheetRoute } = await import(
	"../../src/app/(frontend)/api/moderation/shops/[id]/route"
);
const { GET: summaryRoute } = await import(
	"../../src/app/(frontend)/api/moderation/summary/route"
);

const NOW = new Date("2026-10-03T10:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const later = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

const OWNER = { id: "u-owner", role: "user" };
const MOD = { id: "u-mod", role: "moderator" };
/** A moderator who also works in shop s-1. */
const MOD_MEMBER = { id: "u-mod-member", role: "moderator" };
const ADMIN = { id: "u-admin", role: "admin" };

const MTN = "+237671234421";
const ORANGE = "+237691234455";

function world(extra: Record<string, Doc[]> = {}) {
	const payload = fakePayload({
		users: [
			{ ...OWNER, name: "Aïcha" },
			{ ...MOD, name: "Grâce" },
			{ ...MOD_MEMBER, name: "Hervé" },
			{ ...ADMIN, name: "Inès" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa Tech",
				owner: OWNER.id,
				status: "active",
				level: 2,
				updatedAt: ago(DAY),
			},
			{
				id: "s-2",
				handle: "deido",
				name: "Deido",
				owner: OWNER.id,
				status: "active",
				level: 2,
				updatedAt: ago(DAY),
			},
		],
		"shop-members": [
			{
				id: "m-owner",
				shop: "s-1",
				user: OWNER.id,
				role: "owner",
				status: "active",
			},
			{
				id: "m-mod",
				shop: "s-1",
				user: MOD_MEMBER.id,
				role: "staff",
				status: "active",
			},
		],
		orders: [
			{ id: "o-1", shop: "s-1" },
			{ id: "o-other", shop: "s-2" },
		],
		listings: [],
		products: [],
		reports: [],
		"moderation-log": [],
		"shop-activity-log": [],
		"payout-holds": [],
		"payout-accounts": [],
		"connected-accounts": [],
		payouts: [],
		refunds: [],
		...extra,
	});
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

type World = ReturnType<typeof world>;

const rows = (payload: World, collection: string) =>
	(payload.store[collection] ?? []) as Doc[];
const logs = (payload: World) => rows(payload, "moderation-log");
const holdRow = (payload: World, id: string) =>
	rows(payload, "payout-holds").find((row) => row.id === id);

function heldBy(reason: PayoutHoldReason, over: Doc = {}): Doc {
	return {
		id: `h-${reason}`,
		scope: "shop",
		shop: "s-1",
		reason,
		blocksCharges: false,
		status: "active",
		until: null,
		createdByType: "system",
		createdAt: ago(DAY),
		...over,
	};
}

async function post(
	payload: World,
	user: unknown,
	body: unknown,
	shop = "s-1",
) {
	payload.auth.mockResolvedValue({ user });
	return payoutsRoute(
		new Request(`http://x/api/moderation/shops/${shop}/payouts`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
		{ params: Promise.resolve({ id: shop }) },
	);
}

async function summary(payload: World) {
	payload.auth.mockResolvedValue({ user: MOD });
	return (
		await summaryRoute(new Request("http://x/api/moderation/summary"))
	).json();
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

// ─── The rank ladder ─────────────────────────────────────────────────────────

describe("moderation/summary risk counts", () => {
	it("shows all open risk flags but adds only open high flags to the badge total", async () => {
		const payload = world({
			"risk-flags": [
				{ id: "risk-low", status: "open", severity: "low" },
				{ id: "risk-high", status: "open", severity: "high" },
				{ id: "risk-closed", status: "dismissed", severity: "high" },
			],
		});
		const result = await summary(payload);
		expect(result).toMatchObject({
			openRiskFlags: 2,
			highRiskFlags: 1,
			total: 1,
		});
	});
});

describe("releasePayoutHold — the rank ladder, one case per reason class", () => {
	it.each<[PayoutHoldReason]>([
		["moderation"],
		["dispute_open"],
		["return_open"],
	])("a moderator releases a %s hold, and the release is logged", async (reason) => {
		const payload = world({ "payout-holds": [heldBy(reason)] });
		const released = await releasePayoutHold(payload, MOD, `h-${reason}`, {
			note: " cleared ",
		});

		expect(released).toMatchObject({
			status: "released",
			releasedBy: MOD.id,
			releasedAt: NOW.toISOString(),
		});
		expect(logs(payload)).toHaveLength(1);
		expect(logs(payload)[0]).toMatchObject({
			actor: MOD.id,
			actorRole: "moderator",
			action: "payout.release",
			targetType: "shop",
			targetId: "s-1",
			reason,
			note: "cleared",
			metadata: {
				holdId: `h-${reason}`,
				scope: "shop",
				orderId: null,
				reason,
				until: null,
			},
		});
	});

	it.each<[PayoutHoldReason]>([
		["fraud_signal"],
		["reconciliation_mismatch"],
		["payout_failed_repeatedly"],
		["payout_account_changed"],
	])("a moderator is refused a %s hold (rankTooLow); an admin releases it", async (reason) => {
		const payload = world({ "payout-holds": [heldBy(reason)] });

		await expect(
			releasePayoutHold(payload, MOD, `h-${reason}`),
		).rejects.toMatchObject({ code: "moderation.rankTooLow", status: 403 });
		expect(holdRow(payload, `h-${reason}`)?.status).toBe("active");
		expect(logs(payload)).toHaveLength(0);

		const released = await releasePayoutHold(payload, ADMIN, `h-${reason}`);
		expect(released.status).toBe("released");
		expect(logs(payload).map((row) => [row.action, row.actor])).toEqual([
			["payout.release", ADMIN.id],
		]);
	});

	it("shop_suspended is the suspension's own hold: nobody releases it here", async () => {
		const payload = world({ "payout-holds": [heldBy("shop_suspended")] });
		for (const actor of [MOD, ADMIN]) {
			await expect(
				releasePayoutHold(payload, actor, "h-shop_suspended"),
			).rejects.toMatchObject({
				code: "moderation.invalidTransition",
				status: 409,
			});
		}
		expect(holdRow(payload, "h-shop_suspended")?.status).toBe("active");
		expect(logs(payload)).toHaveLength(0);
	});

	it("an already released hold, or one of another shop, is refused", async () => {
		const payload = world({
			"payout-holds": [
				heldBy("moderation", { status: "released" }),
				heldBy("return_open", { shop: "s-2" }),
			],
		});
		await expect(
			releasePayoutHold(payload, MOD, "h-moderation"),
		).rejects.toMatchObject({ code: "moderation.invalidTransition" });
		const res = await post(payload, MOD, {
			action: "release",
			holdId: "h-return_open",
		});
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({
			code: "moderation.targetNotFound",
		});
		expect(holdRow(payload, "h-return_open")?.status).toBe("active");
		expect(logs(payload)).toHaveLength(0);
	});

	it("the release route answers rankTooLow with its code", async () => {
		const payload = world({ "payout-holds": [heldBy("fraud_signal")] });
		const res = await post(payload, MOD, {
			action: "release",
			holdId: "h-fraud_signal",
		});
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ code: "moderation.rankTooLow" });

		const ok = await post(payload, ADMIN, {
			action: "release",
			holdId: "h-fraud_signal",
		});
		expect(ok.status).toBe(200);
		expect(await ok.json()).toMatchObject({
			id: "h-fraud_signal",
			status: "released",
		});
	});

	it("the release notice carries the category, never the reason", async () => {
		const payload = world({ "payout-holds": [heldBy("dispute_open")] });
		await releasePayoutHold(payload, MOD, "h-dispute_open");
		expect(notify.notifyPayoutHoldReleased.mock.calls).toEqual([
			[
				expect.objectContaining({ id: "s-1" }),
				{
					holdId: "h-dispute_open",
					scope: "shop",
					orderId: null,
					category: "review",
					cause: "released",
				},
			],
		]);
	});
});

// ─── The not-me escalation ───────────────────────────────────────────────────

describe("a hold the not-me path escalated in place", () => {
	function escalationWorld() {
		return world({
			"payout-accounts": [
				{
					id: "pa-old",
					shop: "s-1",
					method: "orange_money",
					accountName: "Aicha Ngo Mbappe",
					accountNumber: ORANGE,
					accountNumberMasked: "+237 6•• •• •4 55",
					status: "replaced",
					activatedAt: ago(30 * DAY),
					replacedAt: ago(HOUR),
				},
				{
					id: "pa-new",
					shop: "s-1",
					method: "mtn_momo",
					accountName: "Aicha Ngo Mbappe",
					accountNumber: MTN,
					accountNumberMasked: "+237 6•• •• •4 21",
					status: "active",
					activatedAt: ago(HOUR),
				},
			],
			"payout-holds": [
				heldBy("payout_account_changed", {
					id: "h-change",
					until: later(71 * HOUR),
				}),
			],
		});
	}

	it("shows on the sheet as fraud_signal with its note, needs an admin, and its release is the first log entry it gets", async () => {
		const payload = escalationWorld();
		await withTransaction(payload, async (req) =>
			revertPayoutAccount(
				req,
				await req.payload.findByID({
					collection: "shops",
					id: "s-1",
					depth: 0,
					overrideAccess: true,
					req,
				}),
				"pa-new",
			),
		);
		// The escalation itself wrote no moderation entry.
		expect(logs(payload)).toHaveLength(0);

		payload.auth.mockResolvedValue({ user: MOD });
		const sheet = await (
			await sheetRoute(new Request("http://x"), {
				params: Promise.resolve({ id: "s-1" }),
			})
		).json();
		expect(sheet.payments.holds).toEqual([
			{
				id: "h-change",
				scope: "shop",
				orderId: null,
				reason: "fraud_signal",
				reasonCategory: "security",
				blocksCharges: true,
				until: null,
				createdByType: "system",
				createdBy: null,
				note: "The owner reported this payout account change as not theirs.",
				createdAt: ago(DAY),
			},
		]);

		await expect(
			releasePayoutHold(payload, MOD, "h-change"),
		).rejects.toMatchObject({ code: "moderation.rankTooLow" });
		await releasePayoutHold(payload, ADMIN, "h-change", { note: "verified" });
		expect(logs(payload)).toEqual([
			expect.objectContaining({
				action: "payout.release",
				actor: ADMIN.id,
				targetId: "s-1",
				metadata: {
					holdId: "h-change",
					scope: "shop",
					orderId: null,
					reason: "fraud_signal",
					until: null,
				},
			}),
		]);
	});
});

// ─── holdPayouts ─────────────────────────────────────────────────────────────

describe("holdPayouts", () => {
	it("creates the hold and its payout.hold entry in one transaction", async () => {
		const payload = world();
		const hold = await holdPayouts(payload, MOD, "s-1", {
			scope: "order",
			orderId: "o-1",
			reason: "dispute_open",
			untilDays: 7,
			note: "buyer dispute by phone",
		});

		expect(rows(payload, "payout-holds")).toEqual([
			expect.objectContaining({
				id: hold.id,
				scope: "order",
				shop: "s-1",
				order: "o-1",
				reason: "dispute_open",
				blocksCharges: false,
				status: "active",
				until: later(7 * DAY),
				createdByType: "moderator",
				createdBy: MOD.id,
				note: "buyer dispute by phone",
			}),
		]);
		expect(logs(payload)).toEqual([
			expect.objectContaining({
				actor: MOD.id,
				action: "payout.hold",
				targetType: "shop",
				targetId: "s-1",
				reason: "dispute_open",
				note: "buyer dispute by phone",
				metadata: {
					holdId: hold.id,
					scope: "order",
					orderId: "o-1",
					reason: "dispute_open",
					until: later(7 * DAY),
				},
			}),
		]);

		const holdWrite = payload.writes.find(
			(w) => w.collection === "payout-holds",
		);
		const logWrite = payload.writes.find(
			(w) => w.collection === "moderation-log",
		);
		expect(holdWrite?.transactionID).toBeTruthy();
		expect(logWrite?.transactionID).toBe(holdWrite?.transactionID);

		expect(notify.notifyPayoutHoldPlaced.mock.calls).toEqual([
			[
				expect.objectContaining({ id: "s-1" }),
				{
					holdId: hold.id,
					scope: "order",
					orderId: "o-1",
					category: "review",
					checkPayoutAccount: false,
				},
			],
		]);
	});

	it("a moderation hold always blocks charges and lasts until released", async () => {
		const payload = world();
		const res = await post(payload, MOD, {
			action: "hold",
			scope: "shop",
			reason: "moderation",
			blocksCharges: false,
		});
		expect(res.status).toBe(201);
		expect(await res.json()).toMatchObject({
			scope: "shop",
			reason: "moderation",
			blocksCharges: true,
			until: null,
		});
		expect(logs(payload)).toHaveLength(1);
	});

	it("a log write that fails takes the hold down with it", async () => {
		const payload = world();
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "moderation-log";
		await expect(
			holdPayouts(payload, MOD, "s-1", { scope: "shop", reason: "moderation" }),
		).rejects.toThrow("forced failure: create");

		expect(rows(payload, "payout-holds")).toHaveLength(0);
		expect(logs(payload)).toHaveLength(0);
		// The path ran: the hold was written before the forced failure.
		expect(
			payload.writes.filter((w) => w.collection === "payout-holds"),
		).toHaveLength(1);
	});

	it("a second identical hold is refused rather than logged twice", async () => {
		const payload = world();
		await holdPayouts(payload, MOD, "s-1", {
			scope: "shop",
			reason: "moderation",
		});
		await expect(
			holdPayouts(payload, ADMIN, "s-1", {
				scope: "shop",
				reason: "moderation",
			}),
		).rejects.toMatchObject({
			code: "moderation.invalidTransition",
			status: 409,
		});
		expect(rows(payload, "payout-holds")).toHaveLength(1);
		expect(logs(payload)).toHaveLength(1);
	});

	it("refuses the suspension's reason and another shop's order", async () => {
		const payload = world();
		await expect(
			holdPayouts(payload, ADMIN, "s-1", {
				scope: "shop",
				reason: "shop_suspended",
			}),
		).rejects.toMatchObject({ code: "moderation.reasonInvalid", status: 400 });
		await expect(
			holdPayouts(payload, MOD, "s-1", {
				scope: "order",
				orderId: "o-other",
				reason: "return_open",
			}),
		).rejects.toMatchObject({ code: "moderation.targetNotFound", status: 404 });
		expect(rows(payload, "payout-holds")).toHaveLength(0);
		expect(logs(payload)).toHaveLength(0);
	});

	it("the route refuses a malformed body and a non-moderator", async () => {
		const payload = world();
		const bad = await post(payload, MOD, {
			action: "hold",
			scope: "shop",
			reason: "because",
		});
		expect(bad.status).toBe(400);
		const noOrder = await post(payload, MOD, {
			action: "hold",
			scope: "order",
			reason: "return_open",
		});
		expect(noOrder.status).toBe(400);
		const user = await post(payload, OWNER, {
			action: "hold",
			scope: "shop",
			reason: "moderation",
		});
		expect(user.status).toBe(403);
		expect(await user.json()).toMatchObject({ code: "moderation.forbidden" });
		expect(rows(payload, "payout-holds")).toHaveLength(0);
	});
});

// ─── Member conflict ─────────────────────────────────────────────────────────

describe("a moderator who is a member of the shop", () => {
	it("is refused every payout action on it, and acts normally on another shop", async () => {
		const payload = world({
			"payout-holds": [heldBy("moderation")],
			"payout-accounts": [
				{
					id: "pa-review",
					shop: "s-1",
					method: "mtn_momo",
					accountName: "Jean Mbappe",
					accountNumber: MTN,
					accountNumberMasked: "+237 6•• •• •4 21",
					status: "pending_review",
				},
			],
		});

		const attempts = [
			() =>
				holdPayouts(payload, MOD_MEMBER, "s-1", {
					scope: "shop",
					reason: "moderation",
				}),
			() => releasePayoutHold(payload, MOD_MEMBER, "h-moderation"),
			() => approvePayoutAccount(payload, MOD_MEMBER, "s-1", "pa-review"),
			() => rejectPayoutAccount(payload, MOD_MEMBER, "s-1", "pa-review"),
		];
		for (const attempt of attempts) {
			await expect(attempt()).rejects.toMatchObject({
				code: "moderation.forbidden",
				status: 403,
			});
		}
		expect(rows(payload, "payout-holds")).toHaveLength(1);
		expect(holdRow(payload, "h-moderation")?.status).toBe("active");
		expect(rows(payload, "payout-accounts")[0].status).toBe("pending_review");
		expect(logs(payload)).toHaveLength(0);

		// Same moderator, a shop they do not belong to: the path runs.
		await holdPayouts(payload, MOD_MEMBER, "s-2", {
			scope: "shop",
			reason: "moderation",
		});
		expect(logs(payload).map((row) => [row.action, row.targetId])).toEqual([
			["payout.hold", "s-2"],
		]);
	});

	it("an admin who owns the shop is refused too", async () => {
		const payload = world({ "payout-holds": [heldBy("fraud_signal")] });
		rows(payload, "shops")[0].owner = ADMIN.id;
		await expect(
			releasePayoutHold(payload, ADMIN, "h-fraud_signal"),
		).rejects.toMatchObject({ code: "moderation.forbidden" });
		expect(holdRow(payload, "h-fraud_signal")?.status).toBe("active");
	});
});

// ─── Payout-account review ───────────────────────────────────────────────────

describe("payout-account review", () => {
	function reviewWorld() {
		return world({
			"payout-accounts": [
				{
					id: "pa-old",
					shop: "s-1",
					method: "orange_money",
					accountName: "Aicha Ngo Mbappe",
					accountNumber: ORANGE,
					accountNumberMasked: "+237 6•• •• •4 55",
					status: "active",
					activatedAt: ago(30 * DAY),
					createdBy: OWNER.id,
				},
				{
					id: "pa-review",
					shop: "s-1",
					method: "mtn_momo",
					accountName: "Jean Mbappe",
					accountNumber: MTN,
					accountNumberMasked: "+237 6•• •• •4 21",
					status: "pending_review",
					nameMatch: {
						identityName: "Aïcha Ngo Mbappé",
						result: "partial",
						score: 0.71,
						checkedAt: ago(DAY),
					},
					createdBy: OWNER.id,
				},
			],
		});
	}

	it("approve activates the row, replaces the previous one, opens the change hold, and the summary count drops", async () => {
		const payload = reviewWorld();
		expect(await summary(payload)).toMatchObject({
			pendingPayoutAccounts: 1,
			total: 1,
		});

		const res = await post(payload, MOD, {
			action: "approve_account",
			accountId: "pa-review",
			note: "operator name confirmed",
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			accountId: "pa-review",
			status: "active",
			replacedAccountIds: ["pa-old"],
			holdUntil: later(72 * HOUR),
		});

		const accounts = rows(payload, "payout-accounts");
		expect(accounts.map((row) => [row.id, row.status])).toEqual([
			["pa-old", "replaced"],
			["pa-review", "active"],
		]);
		expect(accounts[0].replacedAt).toBe(NOW.toISOString());
		expect(accounts[1].activatedAt).toBe(NOW.toISOString());
		expect(rows(payload, "payout-holds")).toEqual([
			expect.objectContaining({
				scope: "shop",
				shop: "s-1",
				reason: "payout_account_changed",
				status: "active",
				until: later(72 * HOUR),
				createdByType: "system",
			}),
		]);
		expect(logs(payload)).toEqual([
			expect.objectContaining({
				actor: MOD.id,
				action: "payout.account_approve",
				targetType: "shop",
				targetId: "s-1",
				note: "operator name confirmed",
				metadata: {
					accountId: "pa-review",
					method: "mtn_momo",
					accountNumberMasked: "+237 6•• •• •4 21",
					nameMatch: "partial",
					replacedAccountIds: ["pa-old"],
					holdUntil: later(72 * HOUR),
				},
			}),
		]);
		expect(notify.notifyPayoutAccountActivated).toHaveBeenCalledTimes(1);
		expect(notify.notifyPayoutAccountChanged).toHaveBeenCalledTimes(1);

		expect(await summary(payload)).toMatchObject({
			pendingPayoutAccounts: 0,
			total: 0,
		});
	});

	it("reject flips the row to rejected and leaves the active account alone", async () => {
		const payload = reviewWorld();
		const decision = await rejectPayoutAccount(
			payload,
			MOD,
			"s-1",
			"pa-review",
			{
				note: "not the owner's line",
			},
		);
		expect(decision).toEqual({
			accountId: "pa-review",
			status: "rejected",
			replacedAccountIds: [],
			holdUntil: null,
		});
		expect(
			rows(payload, "payout-accounts").map((row) => [row.id, row.status]),
		).toEqual([
			["pa-old", "active"],
			["pa-review", "rejected"],
		]);
		expect(rows(payload, "payout-holds")).toHaveLength(0);
		expect(logs(payload).map((row) => [row.action, row.note])).toEqual([
			["payout.account_reject", "not the owner's line"],
		]);
		expect((await summary(payload)).pendingPayoutAccounts).toBe(0);
	});

	it("only a pending_review row of this shop can be decided", async () => {
		const payload = reviewWorld();
		await expect(
			approvePayoutAccount(payload, MOD, "s-1", "pa-old"),
		).rejects.toMatchObject({
			code: "moderation.invalidTransition",
			status: 409,
		});
		await expect(
			rejectPayoutAccount(payload, MOD, "s-2", "pa-review"),
		).rejects.toMatchObject({ code: "moderation.targetNotFound", status: 404 });
		expect(logs(payload)).toHaveLength(0);
	});

	it("a log write that fails undoes the approval", async () => {
		const payload = reviewWorld();
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "moderation-log";
		await expect(
			approvePayoutAccount(payload, MOD, "s-1", "pa-review"),
		).rejects.toThrow("forced failure: create");
		expect(
			rows(payload, "payout-accounts").map((row) => [row.id, row.status]),
		).toEqual([
			["pa-old", "active"],
			["pa-review", "pending_review"],
		]);
		expect(rows(payload, "payout-holds")).toHaveLength(0);
		// The path ran: the activation was written before the forced failure.
		expect(
			payload.writes.filter(
				(w) => w.collection === "payout-accounts" && w.id === "pa-review",
			),
		).toHaveLength(1);
		expect(notify.notifyPayoutAccountActivated).not.toHaveBeenCalled();
	});
});

// ─── The sheet's payments block ──────────────────────────────────────────────

describe("GET /api/moderation/shops/{id} — payments", () => {
	function sheetWorld() {
		const order = (id: string, over: Doc) => ({
			id,
			shop: "s-1",
			paymentMethod: "mobile_money",
			paymentStatus: "paid",
			status: "accepted",
			amounts: { total: 0 },
			createdAt: ago(5 * DAY),
			...over,
		});
		return world({
			"connected-accounts": [
				{
					id: "ca-1",
					shop: "s-1",
					provider: "notchpay",
					providerAccountId: "acct_1",
					accountType: "express",
					status: "active",
					chargesEnabled: true,
					payoutsEnabled: true,
					requirementsDue: [],
					lastSyncedAt: ago(HOUR),
				},
			],
			"payout-accounts": [
				{
					id: "pa-active",
					shop: "s-1",
					method: "mtn_momo",
					accountName: "Aicha Ngo Mbappe",
					accountNumber: MTN,
					accountNumberMasked: "+237 6•• •• •4 21",
					status: "active",
					activatedAt: ago(20 * DAY),
					createdAt: ago(20 * DAY),
				},
				{
					id: "pa-review",
					shop: "s-1",
					method: "orange_money",
					accountName: "Jean Mbappe",
					accountNumber: ORANGE,
					accountNumberMasked: "+237 6•• •• •4 55",
					status: "pending_review",
					nameMatch: {
						identityName: "Aïcha Ngo Mbappé",
						result: "partial",
						score: 0.71,
						checkedAt: ago(DAY),
					},
					createdAt: ago(DAY),
				},
				{
					id: "pa-gone",
					shop: "s-1",
					method: "orange_money",
					accountName: "Aicha Ngo Mbappe",
					accountNumber: "+237699999999",
					accountNumberMasked: "+237 6•• •• •9 99",
					status: "replaced",
					createdAt: ago(60 * DAY),
				},
			],
			"payout-holds": [
				heldBy("moderation", {
					id: "h-mod",
					blocksCharges: true,
					createdByType: "moderator",
					createdBy: MOD.id,
					note: "reviewing complaints",
					createdAt: ago(2 * DAY),
				}),
				heldBy("fraud_signal", {
					id: "h-first",
					scope: "order",
					order: "o-open",
					blocksCharges: true,
					createdAt: ago(DAY),
				}),
				heldBy("return_open", { id: "h-done", status: "released" }),
				heldBy("moderation", { id: "h-elsewhere", shop: "s-2" }),
			],
			orders: [
				// Open protected exposure: paid or partially refunded, not terminal.
				order("o-open", { amounts: { total: 120_000 } }),
				order("o-part", {
					paymentStatus: "partially_refunded",
					status: "delivered",
					amounts: { total: 40_000 },
					settlement: { refundedAmount: 15_000 },
				}),
				order("o-done", { status: "completed", amounts: { total: 90_000 } }),
				order("o-refunded", {
					paymentStatus: "refunded",
					status: "cancelled",
					amounts: { total: 30_000 },
				}),
				order("o-cod", {
					paymentMethod: "cash_on_delivery",
					paymentStatus: "unpaid",
					amounts: { total: 70_000 },
				}),
				order("o-old", {
					status: "completed",
					amounts: { total: 10_000 },
					createdAt: ago(45 * DAY),
				}),
				order("o-other-shop", { shop: "s-2", amounts: { total: 999_000 } }),
			],
			refunds: [
				{ id: "r-1", order: "o-refunded", status: "completed" },
				{ id: "r-2", order: "o-part", status: "completed" },
				{ id: "r-3", order: "o-part", status: "pending" },
				{ id: "r-4", order: "o-done", status: "failed" },
			],
			payouts: Array.from({ length: 6 }, (_, i) => ({
				id: `po-${i}`,
				shop: "s-1",
				connectedAccount: "ca-1",
				payoutAccount: "pa-active",
				amount: 10_000 + i,
				currency: "XAF",
				origin: "platform_release",
				status: i === 5 ? "failed" : "complete",
				failureReason: i === 5 ? "operator_rejected" : null,
				providerTransferId: `tr_${i}`,
				createdAt: ago((6 - i) * DAY),
			})),
		});
	}

	it("carries the whole block: account status, masked account, pending review, every active hold with its reason, exposure, last payouts, refund rate", async () => {
		const payload = sheetWorld();
		payload.auth.mockResolvedValue({ user: MOD });
		const res = await sheetRoute(new Request("http://x"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		expect(res.status).toBe(200);
		const { payments } = await res.json();

		expect(payments).toEqual({
			connectedAccount: {
				status: "active",
				chargesEnabled: true,
				payoutsEnabled: true,
				lastSyncedAt: ago(HOUR),
			},
			payoutAccount: {
				id: "pa-active",
				method: "mtn_momo",
				accountName: "Aicha Ngo Mbappe",
				accountNumberMasked: "+237 6•• •• •4 21",
				activatedAt: ago(20 * DAY),
			},
			pendingAccounts: [
				{
					id: "pa-review",
					method: "orange_money",
					accountName: "Jean Mbappe",
					accountNumberMasked: "+237 6•• •• •4 55",
					nameMatch: {
						result: "partial",
						identityName: "Aïcha Ngo Mbappé",
						score: 0.71,
					},
					createdAt: ago(DAY),
				},
			],
			holds: [
				{
					id: "h-mod",
					scope: "shop",
					orderId: null,
					reason: "moderation",
					reasonCategory: "review",
					blocksCharges: true,
					until: null,
					createdByType: "moderator",
					createdBy: MOD.id,
					note: "reviewing complaints",
					createdAt: ago(2 * DAY),
				},
				{
					id: "h-first",
					scope: "order",
					orderId: "o-open",
					reason: "fraud_signal",
					reasonCategory: "security",
					blocksCharges: true,
					until: null,
					createdByType: "system",
					createdBy: null,
					note: null,
					createdAt: ago(DAY),
				},
			],
			openExposure: 120_000 + 40_000 - 15_000,
			lastPayouts: [5, 4, 3, 2, 1].map((i) => ({
				id: `po-${i}`,
				amount: 10_000 + i,
				currency: "XAF",
				status: i === 5 ? "failed" : "complete",
				origin: "platform_release",
				failureReason: i === 5 ? "operator_rejected" : null,
				createdAt: ago((6 - i) * DAY),
			})),
			refundRate: { windowDays: 30, orders: 4, refundedOrders: 2 },
		});
	});

	it("never carries a full account number, only the masks", async () => {
		const payload = sheetWorld();
		payload.auth.mockResolvedValue({ user: MOD });
		const json = JSON.stringify(
			(
				await (
					await sheetRoute(new Request("http://x"), {
						params: Promise.resolve({ id: "s-1" }),
					})
				).json()
			).payments,
		);
		expect(json).toContain("+237 6•• •• •4 21");
		expect(json).toContain("+237 6•• •• •4 55");
		for (const full of [MTN, ORANGE, "671234421", "691234455"]) {
			expect(json).not.toContain(full);
		}
	});

	it("an empty shop reads as nulls and zeros, not as an error", async () => {
		const payload = world();
		payload.auth.mockResolvedValue({ user: MOD });
		const { payments } = await (
			await sheetRoute(new Request("http://x"), {
				params: Promise.resolve({ id: "s-2" }),
			})
		).json();
		expect(payments).toEqual({
			connectedAccount: null,
			payoutAccount: null,
			pendingAccounts: [],
			holds: [],
			openExposure: 0,
			lastPayouts: [],
			refundRate: { windowDays: 30, orders: 0, refundedOrders: 0 },
		});
	});
});
