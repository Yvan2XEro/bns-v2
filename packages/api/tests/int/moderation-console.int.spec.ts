// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModerationQueueItem } from "../../src/contracts/moderationConsole";
import { ERROR_CODES } from "../../src/lib/errors";
import { claimRiskFlag } from "../../src/services/riskFlagQueue";
import { fakePayload } from "./helpers/fakePayload";

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

import { GET as getLog } from "../../src/app/(frontend)/api/moderation/log/route";
import { POST as postNext } from "../../src/app/(frontend)/api/moderation/queue/next/route";
import { GET as getQueue } from "../../src/app/(frontend)/api/moderation/queue/route";
import { POST as postRiskClaim } from "../../src/app/(frontend)/api/moderation/risk-flags/[id]/claim/route";
import { GET as getShops } from "../../src/app/(frontend)/api/moderation/shops/route";

const MOD = "65f000000000000000000001";
const MOD2 = "65f000000000000000000002";
const PLAIN = "65f000000000000000000003";
const OWNER = "65f000000000000000000004";
const SHOP1 = "65f0000000000000000000a1";
const SHOP2 = "65f0000000000000000000a2";
const LISTING_PENDING = "65f0000000000000000000b1";
const LISTING_LIVE = "65f0000000000000000000b2";
const REPORT_LISTING = "65f0000000000000000000c1";
const REPORT_SHOP = "65f0000000000000000000c2";
const VERIFY_OPEN = "65f0000000000000000000d1";
const VERIFY_MINE = "65f0000000000000000000d2";
const DISPUTE_OVERDUE = "65f0000000000000000000e1";
const DISPUTE_TAKEN = "65f0000000000000000000e2";
const ORDER = "65f0000000000000000000e9";
const FLAG_OPEN = "65f0000000000000000000f1";
const FLAG_CLOSED = "65f0000000000000000000f2";
const PAYOUT = "65f0000000000000000000a9";

const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function seed() {
	return fakePayload({
		users: [
			{ id: MOD, role: "moderator", name: "Mona" },
			{ id: MOD2, role: "moderator", name: "Theo" },
			{ id: PLAIN, role: "user", name: "Plain" },
			{ id: OWNER, role: "user", name: "Aicha" },
		],
		shops: [
			{
				id: SHOP1,
				name: "Akwa Fashion",
				handle: "akwa-fashion",
				status: "active",
				level: 2,
				owner: OWNER,
				logo: { id: "media-1", url: "/media/akwa.png" },
				createdAt: ago(30),
			},
			{
				id: SHOP2,
				name: "Kilo Tech",
				handle: "kilo-tech",
				status: "suspended",
				owner: OWNER,
				createdAt: ago(20),
			},
		],
		listings: [
			{
				id: LISTING_PENDING,
				title: "Red dress",
				status: "pending",
				shop: SHOP1,
				createdAt: ago(5),
			},
			{
				id: LISTING_LIVE,
				title: "Blue shoes",
				status: "published",
				shop: SHOP1,
				createdAt: ago(10),
			},
		],
		reports: [
			{
				id: REPORT_LISTING,
				status: "pending",
				targetType: "listing",
				targetId: LISTING_LIVE,
				reason: "fraud",
				createdAt: ago(4),
			},
			{
				id: REPORT_SHOP,
				status: "pending",
				targetType: "shop",
				targetId: SHOP1,
				reason: "spam",
				createdAt: ago(3),
			},
			{
				id: "65f0000000000000000000c3",
				status: "resolved",
				targetType: "shop",
				targetId: SHOP1,
				reason: "spam",
				createdAt: ago(3),
			},
		],
		"verification-requests": [
			{
				id: VERIFY_OPEN,
				status: "submitted",
				shop: SHOP2,
				requestedLevel: 2,
				submittedAt: ago(6),
				createdAt: ago(6),
			},
			{
				id: VERIFY_MINE,
				status: "in_review",
				shop: SHOP1,
				requestedLevel: 3,
				assignee: MOD,
				claimedAt: ago(1),
				submittedAt: ago(2),
				createdAt: ago(2),
			},
		],
		disputes: [
			{
				id: DISPUTE_OVERDUE,
				number: "D-0001",
				status: "under_review",
				reason: "not_received",
				shop: SHOP1,
				order: ORDER,
				deadlines: { reviewDueAt: new Date(NOW - 3_600_000).toISOString() },
				createdAt: ago(1),
			},
			{
				id: DISPUTE_TAKEN,
				number: "D-0002",
				status: "open",
				reason: "damaged",
				shop: SHOP1,
				order: ORDER,
				assignedTo: MOD2,
				deadlines: { respondBy: new Date(NOW + 2 * 86_400_000).toISOString() },
				createdAt: ago(7),
			},
		],
		"risk-flags": [
			{
				id: FLAG_OPEN,
				status: "open",
				severity: "high",
				score: 90,
				signal: "orders.dispute_ratio",
				subjectType: "shop",
				subjectKey: SHOP1,
				subjectLabel: "Akwa Fashion",
				subjectRef: { relationTo: "shops", value: SHOP1 },
				createdAt: ago(8),
			},
			{
				id: FLAG_CLOSED,
				status: "dismissed",
				severity: "low",
				score: 10,
				signal: "orders.dispute_ratio",
				subjectType: "shop",
				subjectKey: SHOP1,
				createdAt: ago(8),
			},
		],
		"payout-accounts": [
			{
				id: PAYOUT,
				status: "pending_review",
				shop: SHOP1,
				method: "mtn_momo",
				createdAt: ago(9),
			},
		],
		"shop-strikes": [
			{
				id: "65f0000000000000000000a5",
				shop: SHOP1,
				status: "active",
				weight: 1,
				expiresAt: new Date(NOW + 86_400_000).toISOString(),
			},
			{
				id: "65f0000000000000000000a6",
				shop: SHOP1,
				status: "active",
				weight: 1,
				expiresAt: ago(1),
			},
			{
				id: "65f0000000000000000000a7",
				shop: SHOP1,
				status: "revoked",
				weight: 1,
				expiresAt: new Date(NOW + 86_400_000).toISOString(),
			},
		],
		"shop-members": [],
		"moderation-log": [
			{
				id: "log-1",
				actor: MOD,
				actorRole: "moderator",
				action: "listing.approve",
				targetType: "listing",
				targetId: LISTING_LIVE,
				note: "=HYPERLINK(1)",
				createdAt: ago(3),
			},
			{
				id: "log-2",
				actor: MOD2,
				actorRole: "moderator",
				action: "shop.suspend",
				targetType: "shop",
				targetId: SHOP2,
				reason: "fraud",
				note: 'Said "no", twice',
				createdAt: ago(2),
			},
			{
				id: "log-3",
				actor: MOD,
				actorRole: "moderator",
				action: "dispute.assign",
				targetType: "dispute",
				targetId: DISPUTE_TAKEN,
				createdAt: ago(1),
			},
		],
	});
}

type World = ReturnType<typeof seed>;

function as(payload: World, user: unknown): World {
	Object.assign(payload, { auth: async () => ({ user }) });
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const moderator = { id: MOD, role: "moderator" };
const url = (path: string) => `https://api.example/api/moderation/${path}`;
const next = (body: unknown = {}) =>
	postNext(
		new Request(url("queue/next"), {
			method: "POST",
			body: JSON.stringify(body),
		}),
	);

beforeEach(() => {
	getPayloadMock.mockReset();
});

describe("moderation console routes — access", () => {
	it("answers 401 to an anonymous caller and 403 to a non-moderator on every route", async () => {
		const calls = () => [
			getQueue(new Request(url("queue"))),
			next(),
			getShops(new Request(url("shops"))),
			getLog(new Request(url("log"))),
			postRiskClaim(new Request(url(`risk-flags/${FLAG_OPEN}/claim`)), {
				params: Promise.resolve({ id: FLAG_OPEN }),
			}),
		];
		as(seed(), null);
		for (const response of await Promise.all(calls())) {
			expect(response.status).toBe(401);
		}
		const payload = as(seed(), { id: PLAIN, role: "user" });
		for (const response of await Promise.all(calls())) {
			expect(response.status).toBe(403);
		}
		expect(payload.store["moderation-log"]).toHaveLength(3);
	});
});

describe("GET /api/moderation/queue", () => {
	it("merges every source, overdue first then oldest deadline or arrival", async () => {
		as(seed(), moderator);
		const response = await getQueue(new Request(url("queue")));
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		const body = await response.json();
		expect(
			body.items.map((item: ModerationQueueItem) => [item.type, item.id]),
		).toEqual([
			["dispute", DISPUTE_OVERDUE],
			["payoutAccount", PAYOUT],
			["risk", FLAG_OPEN],
			["verification", VERIFY_OPEN],
			["listing", LISTING_PENDING],
			["report", REPORT_LISTING],
			["report", REPORT_SHOP],
			["verification", VERIFY_MINE],
			["dispute", DISPUTE_TAKEN],
		]);
		expect(body).toMatchObject({
			total: 9,
			nextCursor: null,
			truncated: false,
		});

		const byId = new Map<string, ModerationQueueItem>(
			body.items.map((item: ModerationQueueItem) => [item.id, item]),
		);
		expect(byId.get(DISPUTE_OVERDUE)).toMatchObject({
			title: "D-0001",
			subtitle: "Akwa Fashion",
			detail: "not_received",
			overdue: true,
			orderId: ORDER,
			assignee: null,
		});
		expect(byId.get(DISPUTE_TAKEN)).toMatchObject({
			overdue: false,
			assignee: { id: MOD2, name: "Theo" },
		});
		expect(byId.get(REPORT_LISTING)).toMatchObject({
			title: "Blue shoes",
			detail: "fraud",
			targetType: "listing",
			targetId: LISTING_LIVE,
			dueAt: null,
		});
		expect(byId.get(REPORT_SHOP)).toMatchObject({
			title: "Akwa Fashion",
			shopId: SHOP1,
		});
		expect(byId.get(FLAG_OPEN)).toMatchObject({
			title: "Akwa Fashion",
			severity: "high",
			score: 90,
			detail: "orders.dispute_ratio",
			shopId: SHOP1,
		});
		expect(byId.get(VERIFY_OPEN)).toMatchObject({
			title: "Kilo Tech",
			detail: "level:2",
		});
		expect(byId.get(LISTING_PENDING)).toMatchObject({
			title: "Red dress",
			subtitle: "Akwa Fashion",
		});
		expect(byId.get(PAYOUT)).toMatchObject({
			title: "Akwa Fashion",
			detail: "mtn_momo",
		});
	});

	it("filters by type and by the caller's assignments, and pages with an offset cursor", async () => {
		as(seed(), moderator);
		const reports = await (
			await getQueue(new Request(url("queue?type=report")))
		).json();
		expect(reports.items.map((item: ModerationQueueItem) => item.id)).toEqual([
			REPORT_LISTING,
			REPORT_SHOP,
		]);

		const mine = await (
			await getQueue(new Request(url("queue?mine=1")))
		).json();
		expect(mine.items.map((item: ModerationQueueItem) => item.id)).toEqual([
			VERIFY_MINE,
		]);

		const first = await (
			await getQueue(new Request(url("queue?limit=4")))
		).json();
		expect(first.items).toHaveLength(4);
		expect(first.nextCursor).toBe("4");
		const second = await (
			await getQueue(new Request(url("queue?limit=4&cursor=4")))
		).json();
		expect(second.items[0].id).toBe(LISTING_PENDING);
	});

	it("refuses an unknown type or a malformed cursor", async () => {
		as(seed(), moderator);
		for (const query of ["type=order", "cursor=abc", "limit=0"]) {
			const response = await getQueue(new Request(url(`queue?${query}`)));
			expect(response.status).toBe(400);
		}
	});
});

describe("POST /api/moderation/queue/next", () => {
	it("assigns the most urgent unassigned item, then the next, then reports nothing left", async () => {
		const payload = as(seed(), moderator);

		const first = await (await next()).json();
		expect(first.item).toMatchObject({
			type: "dispute",
			id: DISPUTE_OVERDUE,
			assignee: { id: MOD, name: "Mona" },
		});
		expect(
			payload.store.disputes.find((row) => row.id === DISPUTE_OVERDUE),
		).toMatchObject({ assignedTo: MOD });

		const second = await (await next()).json();
		expect(second.item).toMatchObject({ type: "risk", id: FLAG_OPEN });

		const third = await (await next()).json();
		expect(third.item).toMatchObject({ type: "verification", id: VERIFY_OPEN });
		expect(
			payload.store["verification-requests"].find(
				(row) => row.id === VERIFY_OPEN,
			),
		).toMatchObject({ status: "in_review", assignee: MOD });

		const empty = await next();
		expect(empty.status).toBe(200);
		expect(await empty.json()).toEqual({ item: null });

		const actions = payload.store["moderation-log"].map((row) => row.action);
		expect(actions).toEqual(
			expect.arrayContaining([
				"dispute.assign",
				"risk_flag.assign",
				"verification.claim",
			]),
		);
	});

	it("skips a candidate the caller may not take and moves to the next one", async () => {
		const payload = seed();
		// The caller owns the shop behind the only verification request: a
		// conflict of interest the claim refuses.
		const shop = payload.store.shops.find((row) => row.id === SHOP2);
		if (shop) shop.owner = MOD;
		as(payload, moderator);

		const response = await next({ type: "verification" });
		expect(await response.json()).toEqual({ item: null });
		expect(
			payload.store["verification-requests"].find(
				(row) => row.id === VERIFY_OPEN,
			),
		).toMatchObject({ status: "submitted" });
	});

	it("refuses a type that cannot be assigned", async () => {
		as(seed(), moderator);
		expect((await next({ type: "listing" })).status).toBe(400);
	});
});

describe("risk flag claim", () => {
	it("assigns an open flag to the caller and logs it", async () => {
		const payload = as(seed(), moderator);
		const response = await postRiskClaim(
			new Request(url(`risk-flags/${FLAG_OPEN}/claim`), { method: "POST" }),
			{ params: Promise.resolve({ id: FLAG_OPEN }) },
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: FLAG_OPEN, assignedTo: MOD });
		expect(payload.store["moderation-log"].at(-1)).toMatchObject({
			action: "risk_flag.assign",
			targetType: "risk-flag",
			targetId: FLAG_OPEN,
			actor: MOD,
		});
	});

	it("refuses a flag held by someone else or no longer open", async () => {
		const payload = seed();
		await claimRiskFlag(payload, { id: MOD2, role: "moderator" }, FLAG_OPEN);
		await expect(
			claimRiskFlag(payload, moderator, FLAG_OPEN),
		).rejects.toMatchObject({
			code: ERROR_CODES.moderationInvalidTransition,
			status: 409,
		});
		await expect(
			claimRiskFlag(payload, moderator, FLAG_CLOSED),
		).rejects.toMatchObject({ status: 409 });

		as(payload, moderator);
		const response = await postRiskClaim(
			new Request(url(`risk-flags/${FLAG_OPEN}/claim`), { method: "POST" }),
			{ params: Promise.resolve({ id: FLAG_OPEN }) },
		);
		expect(response.status).toBe(409);
	});

	it("is idempotent for the holder", async () => {
		const payload = seed();
		await claimRiskFlag(payload, moderator, FLAG_OPEN);
		const again = await claimRiskFlag(payload, moderator, FLAG_OPEN);
		expect(again.assignedTo).toBe(MOD);
		expect(
			payload.store["moderation-log"].filter(
				(row) => row.action === "risk_flag.assign",
			),
		).toHaveLength(1);
	});
});

describe("GET /api/moderation/shops", () => {
	it("finds shops by name or handle, case-insensitively, with their counts", async () => {
		as(seed(), moderator);
		const response = await getShops(new Request(url("shops?q=AKWA")));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.items).toEqual([
			{
				id: SHOP1,
				name: "Akwa Fashion",
				handle: "akwa-fashion",
				logoUrl: "/media/akwa.png",
				status: "active",
				level: 2,
				owner: { id: OWNER, name: "Aicha" },
				openReports: 2,
				strikes: 1,
				createdAt: ago(30),
			},
		]);
		expect(body.nextCursor).toBeNull();

		const byHandle = await (
			await getShops(new Request(url("shops?q=kilo-t")))
		).json();
		expect(byHandle.items.map((shop: { id: string }) => shop.id)).toEqual([
			SHOP2,
		]);
	});

	it("filters by status and lists newest first without a query", async () => {
		as(seed(), moderator);
		const suspended = await (
			await getShops(new Request(url("shops?status=suspended")))
		).json();
		expect(suspended.items).toHaveLength(1);
		expect(suspended.items[0]).toMatchObject({
			id: SHOP2,
			level: 1,
			logoUrl: null,
			openReports: 0,
			strikes: 0,
		});

		const all = await (await getShops(new Request(url("shops")))).json();
		expect(all.items.map((shop: { id: string }) => shop.id)).toEqual([
			SHOP2,
			SHOP1,
		]);
		expect((await getShops(new Request(url("shops?status=gone")))).status).toBe(
			400,
		);
	});
});

describe("GET /api/moderation/log", () => {
	it("lists newest first with the actor's name", async () => {
		as(seed(), moderator);
		const response = await getLog(new Request(url("log")));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.items.map((row: { id: string }) => row.id)).toEqual([
			"log-3",
			"log-2",
			"log-1",
		]);
		expect(body.items[1]).toMatchObject({
			action: "shop.suspend",
			actor: { id: MOD2, name: "Theo" },
			actorRole: "moderator",
			targetType: "shop",
			targetId: SHOP2,
			reason: "fraud",
		});
		expect(body.nextCursor).toBeNull();
	});

	it("filters by actor, action, target and date range", async () => {
		as(seed(), moderator);
		const ids = async (query: string) =>
			(await (await getLog(new Request(url(`log?${query}`)))).json()).items.map(
				(row: { id: string }) => row.id,
			);
		expect(await ids(`actor=${MOD}`)).toEqual(["log-3", "log-1"]);
		expect(await ids("action=shop.suspend")).toEqual(["log-2"]);
		expect(await ids(`targetType=dispute&targetId=${DISPUTE_TAKEN}`)).toEqual([
			"log-3",
		]);
		expect(
			await ids(
				`from=${encodeURIComponent(ago(2.5))}&to=${encodeURIComponent(ago(1.5))}`,
			),
		).toEqual(["log-2"]);
		for (const query of [
			"actor=nope",
			"action=listing.burn",
			"from=yesterday",
		]) {
			expect((await getLog(new Request(url(`log?${query}`)))).status).toBe(400);
		}
	});

	it("exports the same filtered rows as CSV, quoted and formula-safe", async () => {
		as(seed(), moderator);
		const response = await getLog(new Request(url("log?format=csv")));
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/csv; charset=utf-8",
		);
		const lines = (await response.text()).trim().split("\n");
		expect(lines[0]).toBe(
			"createdAt,action,actorId,actorName,actorRole,targetType,targetId,reason,note",
		);
		expect(lines).toHaveLength(4);
		expect(lines[2]).toBe(
			`${ago(2)},shop.suspend,${MOD2},Theo,moderator,shop,${SHOP2},fraud,"Said ""no"", twice"`,
		);
		expect(lines[3].endsWith(",'=HYPERLINK(1)")).toBe(true);

		const filtered = await getLog(
			new Request(url(`log?format=csv&actor=${MOD2}`)),
		);
		expect((await filtered.text()).trim().split("\n")).toHaveLength(2);
	});
});
