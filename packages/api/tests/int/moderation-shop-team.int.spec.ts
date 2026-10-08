import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

import { GET } from "../../src/app/(frontend)/api/moderation/shops/[id]/route";

/**
 * The moderation shop sheet's Team section (Task 32): the shop's active
 * members and its last 20 activity entries, read by a moderator who holds no
 * shop role at all. `resolveShopRole` answers `null` for a moderator, so
 * `requireShopPermission` must never sit in this route's path — the test
 * below that seeds a shop member who is *not* a moderator is what would catch
 * that mistake: a `requireShopPermission`-based check would key off shop
 * membership and let that caller through, when only the moderator check may
 * decide this route.
 */

function activityEntry(
	overrides: Partial<Record<string, unknown>> & {
		id: string;
		createdAt: string;
	},
) {
	return {
		shop: "s-1",
		actor: "u-owner",
		actorRole: "owner",
		action: "shop.updated",
		targetType: "shop",
		targetId: "s-1",
		metadata: null,
		...overrides,
	};
}

function seed() {
	const now = Date.now();
	const activity = Array.from({ length: 25 }, (_, i) =>
		activityEntry({
			id: `act-${i}`,
			createdAt: new Date(now - i * 1000).toISOString(),
		}),
	);
	// Entry index 10 (not the newest, not among the oldest 5 that fall outside
	// the last-20 window) carries the cost-bearing action.
	activity[10] = activityEntry({
		id: "act-cost",
		createdAt: new Date(now - 10_000).toISOString(),
		action: "variant.cost_changed",
		actor: "u-owner",
		actorRole: "owner",
		targetType: "variant",
		targetId: "v-1",
		metadata: { before: { unitCost: 1000 }, after: { unitCost: 1200 } },
	});

	return fakePayload({
		users: [
			{ id: "u-owner", role: "user", name: "Aicha" },
			{ id: "u-manager", role: "user", name: "Bruno" },
			{ id: "u-staff", role: "user", name: "Colette" },
			{ id: "u-revoked", role: "user", name: "Didier" },
			{ id: "u-mod", role: "moderator", name: "Moderator" },
			{ id: "u-admin", role: "admin", name: "Admin" },
			{ id: "u-plain", role: "user", name: "Plain" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa",
				owner: "u-owner",
				status: "active",
				level: 2,
			},
		],
		listings: [],
		reports: [],
		"moderation-log": [],
		"shop-members": [
			{
				id: "m-owner",
				shop: "s-1",
				user: "u-owner",
				role: "owner",
				status: "active",
				joinedAt: new Date(now - 100_000).toISOString(),
				inboxNotifications: "all",
			},
			{
				id: "m-manager",
				shop: "s-1",
				user: "u-manager",
				role: "manager",
				status: "active",
				joinedAt: new Date(now - 90_000).toISOString(),
				inboxNotifications: "all",
			},
			{
				id: "m-staff",
				shop: "s-1",
				user: "u-staff",
				role: "staff",
				status: "active",
				joinedAt: new Date(now - 80_000).toISOString(),
				inboxNotifications: "assigned",
			},
			{
				id: "m-revoked",
				shop: "s-1",
				user: "u-revoked",
				role: "staff",
				status: "revoked",
				joinedAt: new Date(now - 200_000).toISOString(),
				revokedAt: new Date(now - 5_000).toISOString(),
				revokedBy: "u-owner",
				inboxNotifications: "none",
			},
			// `u-plain` is a shop member, but membership is not a moderation
			// credential: it must not be enough to pass this route.
			{
				id: "m-plain",
				shop: "s-1",
				user: "u-plain",
				role: "staff",
				status: "active",
				joinedAt: new Date(now - 70_000).toISOString(),
				inboxNotifications: "assigned",
			},
		],
		"shop-activity-log": activity,
	});
}

function withAuth(payload: ReturnType<typeof seed>, user: unknown) {
	Object.assign(payload, { auth: async () => ({ user }) });
	return payload;
}

async function callRoute(payload: ReturnType<typeof seed>, shopId = "s-1") {
	getPayloadMock.mockResolvedValue(payload);
	return GET(new Request("http://x"), {
		params: Promise.resolve({ id: shopId }),
	});
}

beforeEach(() => {
	getPayloadMock.mockReset();
});

afterEach(() => {
	getPayloadMock.mockReset();
});

describe("GET /api/moderation/shops/{id} — Team section", () => {
	it("lists the active members with name, role and joinedAt, excludes the revoked one, and carries no inboxNotifications or revokedBy", async () => {
		const payload = withAuth(seed(), { id: "u-mod", role: "moderator" });
		const res = await callRoute(payload);
		expect(res.status).toBe(200);
		const body = await res.json();

		const ids = body.team.map((m: { id: string }) => m.id);
		expect(ids.sort()).toEqual(
			["m-owner", "m-manager", "m-staff", "m-plain"].sort(),
		);
		expect(ids).not.toContain("m-revoked");

		for (const member of body.team) {
			expect(member).not.toHaveProperty("inboxNotifications");
			expect(member).not.toHaveProperty("revokedBy");
			expect(typeof member.name).toBe("string");
			expect(typeof member.role).toBe("string");
			expect("joinedAt" in member).toBe(true);
		}

		const owner = body.team.find((m: { id: string }) => m.id === "m-owner");
		expect(owner).toMatchObject({ name: "Aicha", role: "owner" });
	});

	it("carries exactly 20 activity entries, newest first, with the cost-changed entry present but its metadata stripped", async () => {
		const payload = withAuth(seed(), { id: "u-mod", role: "moderator" });
		const res = await callRoute(payload);
		const body = await res.json();

		expect(body.activity).toHaveLength(20);
		const createdAts = body.activity.map((e: { createdAt: string }) =>
			new Date(e.createdAt).getTime(),
		);
		expect([...createdAts].sort((a, b) => b - a)).toEqual(createdAts);

		const costEntry = body.activity.find(
			(e: { id: string }) => e.id === "act-cost",
		);
		expect(costEntry).toBeDefined();
		expect(costEntry.action).toBe("variant.cost_changed");
		expect(costEntry.metadata).toBeNull();

		// An ordinary entry keeps its metadata (it never carried one here, but
		// the key must still be present rather than stripped wholesale).
		const ordinary = body.activity.find(
			(e: { id: string }) => e.id === "act-0",
		);
		expect(ordinary).toBeDefined();
		expect(ordinary).toHaveProperty("metadata");
	});

	it("refuses a caller who is neither admin nor moderator", async () => {
		const payload = withAuth(seed(), { id: "u-plain", role: "user" });
		const res = await callRoute(payload);
		expect(res.status).toBe(403);
	});

	it("refuses a shop member who is not a moderator — membership is not a moderation credential", async () => {
		// `u-plain` holds an active "staff" membership on s-1 (seeded above),
		// but is a plain user. A route that authorised through
		// `requireShopPermission`/`resolveShopRole` instead of the moderator
		// check would let this caller through; the moderator check must not.
		const payload = withAuth(seed(), { id: "u-plain", role: "user" });
		const res = await callRoute(payload);
		expect(res.status).toBe(403);
	});

	it("an admin may also read the Team section", async () => {
		const payload = withAuth(seed(), { id: "u-admin", role: "admin" });
		const res = await callRoute(payload);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.team.length).toBe(4);
	});
});
