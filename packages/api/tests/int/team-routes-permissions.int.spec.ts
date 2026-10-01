// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { maskEmail, maskPhone } from "../../src/lib/invitationTargets";
import { fakePayload } from "./helpers/fakePayload";

/**
 * Companion to `team-routes.int.spec.ts`. That file mocks
 * `services/shopMembers` and `services/shopActivity` entirely, so it proves
 * the HTTP shells validate input and pass arguments through — it cannot
 * prove the permission split actually reaches a caller, because the layer
 * that enforces it is mocked away.
 *
 * This file runs the real services against the in-memory Payload fake, only
 * mocking `getPayload` so `requireUser` resolves it instead of opening Mongo.
 * Every status/code asserted here comes from `requireShopPermission` (or a
 * route-adjacent service check) running for real.
 */

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const OWNER = "u-owner";
const MANAGER = "u-mgr";
const STAFF = "u-staff";
const OUTSIDER = "u-outsider";

function seed(
	over: {
		invitations?: Record<string, unknown>[];
		members?: Record<string, unknown>[];
	} = {},
) {
	const payload = fakePayload(
		{
			users: [
				{ id: OWNER, role: "user", name: "Aicha", email: "aicha@example.com" },
				{
					id: MANAGER,
					role: "user",
					name: "Bruno",
					email: "bruno@example.com",
				},
				{ id: STAFF, role: "user", name: "Clara", email: "clara@example.com" },
				{ id: OUTSIDER, role: "user", name: "Dede", email: "dede@example.com" },
			],
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					name: "Akwa",
					owner: OWNER,
					status: "active",
					level: 3,
					levelExpiresAt: null,
					logo: null,
				},
			],
			"shop-members": over.members ?? [
				{
					id: "m-owner",
					shop: "s-1",
					user: OWNER,
					role: "owner",
					status: "active",
					joinedAt: "2026-01-01T00:00:00.000Z",
					inboxNotifications: "all",
				},
				{
					id: "m-mgr",
					shop: "s-1",
					user: MANAGER,
					role: "manager",
					status: "active",
					joinedAt: "2026-02-01T00:00:00.000Z",
					inboxNotifications: "all",
				},
				{
					id: "m-staff",
					shop: "s-1",
					user: STAFF,
					role: "staff",
					status: "active",
					joinedAt: "2026-03-01T00:00:00.000Z",
					inboxNotifications: "assigned",
				},
			],
			"shop-invitations": over.invitations ?? [],
			"shop-activity-log": [],
			conversations: [],
			"conversation-reads": [],
		},
		{
			uniques: {
				"shop-members": [["shop", "user"]],
				"shop-invitations": [["pendingKey"]],
			},
		},
	);
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const asUser = (payload: ReturnType<typeof seed>, id: string) =>
	payload.auth.mockResolvedValue({ user: { id, role: "user" } });

const get = (url: string) => new Request(`http://localhost${url}`);
const del = (url: string) =>
	new Request(`http://localhost${url}`, { method: "DELETE" });
const post = (url: string, body: unknown = {}) =>
	new Request(`http://localhost${url}`, {
		method: "POST",
		body: JSON.stringify(body),
	});
const patch = (url: string, body: unknown) =>
	new Request(`http://localhost${url}`, {
		method: "PATCH",
		body: JSON.stringify(body),
	});
// Overloaded rather than typed with a plain `Record<string, string>` extra:
// a route's `Params` type names its exact keys (`memberId`, `invId`), and an
// index-signature parameter type cannot prove those keys are present, which
// `tsc` then flags on every call site. The generic overload keeps the extra
// object's literal shape instead of widening it.
function params(id: string): { params: Promise<{ id: string }> };
function params<T extends Record<string, string>>(
	id: string,
	extra: T,
): { params: Promise<{ id: string } & T> };
function params(id: string, extra: Record<string, string> = {}) {
	return { params: Promise.resolve({ id, ...extra }) };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("PATCH /api/shops/{id}/members/{memberId} — role change", () => {
	it("lets the owner, who holds team.manageManagers, promote a staff member", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { PATCH } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await PATCH(
			patch("/x", { role: "manager" }),
			params("s-1", { memberId: "m-staff" }),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).role).toBe("manager");
	});

	it("isolates team.manageManagers: refuses a manager, who does not hold it, with shop.forbidden", async () => {
		const payload = seed();
		asUser(payload, MANAGER);
		const { PATCH } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await PATCH(
			patch("/x", { role: "staff" }),
			params("s-1", { memberId: "m-mgr" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.forbidden" });
	});

	it("refuses a staff member, who holds neither team permission beyond team.view", async () => {
		const payload = seed();
		asUser(payload, STAFF);
		const { PATCH } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await PATCH(
			patch("/x", { role: "manager" }),
			params("s-1", { memberId: "m-mgr" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.forbidden" });
	});

	it("refuses a non-member with shop.notMember", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { PATCH } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await PATCH(
			patch("/x", { role: "manager" }),
			params("s-1", { memberId: "m-staff" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.notMember" });
	});

	it("isolates team.cannotManageRole: the owner's own row can never change role, even though the owner holds team.manageManagers", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { PATCH } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await PATCH(
			patch("/x", { role: "staff" }),
			params("s-1", { memberId: "m-owner" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			code: "team.cannotManageRole",
		});
	});
});

describe("DELETE /api/shops/{id}/members/{memberId} — remove", () => {
	it("a manager, holding team.inviteStaff, may remove a staff member", async () => {
		const payload = seed();
		asUser(payload, MANAGER);
		const { DELETE } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await DELETE(
			del("/x"),
			params("s-1", { memberId: "m-staff" }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ removed: true });
	});

	it("isolates the per-target-row split: that same manager is refused on another manager, which needs team.manageManagers", async () => {
		const payload = seed();
		asUser(payload, MANAGER);
		const { DELETE } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await DELETE(
			del("/x"),
			params("s-1", { memberId: "m-mgr" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.forbidden" });
	});

	it("refuses a staff member entirely", async () => {
		const payload = seed();
		asUser(payload, STAFF);
		const { DELETE } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await DELETE(
			del("/x"),
			params("s-1", { memberId: "m-mgr" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.forbidden" });
	});

	it("refuses a non-member with shop.notMember", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { DELETE } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await DELETE(
			del("/x"),
			params("s-1", { memberId: "m-staff" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.notMember" });
	});

	it("refuses removing the owner's row with team.cannotManageRole, from the owner's own hand", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { DELETE } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await DELETE(
			del("/x"),
			params("s-1", { memberId: "m-owner" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			code: "team.cannotManageRole",
		});
	});
});

describe("POST /api/shops/{id}/invitations — invite", () => {
	it("lets a manager invite a staff member", async () => {
		const payload = seed();
		asUser(payload, MANAGER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/route"
		);
		const response = await POST(
			post("/x", {
				channel: "email",
				email: "new-staff@example.com",
				role: "staff",
			}),
			params("s-1"),
		);
		expect(response.status).toBe(201);
	});

	it("isolates team.manageManagers on invite: refuses that same manager inviting a manager", async () => {
		const payload = seed();
		asUser(payload, MANAGER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/route"
		);
		const response = await POST(
			post("/x", {
				channel: "email",
				email: "new-mgr@example.com",
				role: "manager",
			}),
			params("s-1"),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.forbidden" });
	});

	it("refuses a staff member inviting anyone", async () => {
		const payload = seed();
		asUser(payload, STAFF);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/route"
		);
		const response = await POST(
			post("/x", { channel: "email", email: "x@y.com", role: "staff" }),
			params("s-1"),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.forbidden" });
	});

	it("refuses a non-member with shop.notMember", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/route"
		);
		const response = await POST(
			post("/x", { channel: "email", email: "x@y.com", role: "staff" }),
			params("s-1"),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.notMember" });
	});
});

describe("the invitation levers key their permission off the invitation's own role", () => {
	const invitations = () => [
		{
			id: "inv-staff",
			shop: "s-1",
			role: "staff",
			channel: "phone" as const,
			phone: "+237612345421",
			email: null,
			pendingKey: "s-1:phone:+237612345421",
			tokenHash: "a".repeat(64),
			status: "pending",
			invitedBy: OWNER,
			expiresAt: "2026-12-01T00:00:00.000Z",
			sendCount: 1,
			lastSentAt: "2026-09-01T00:00:00.000Z",
		},
		{
			id: "inv-mgr",
			shop: "s-1",
			role: "manager",
			channel: "email" as const,
			phone: null,
			email: "secret@example.com",
			pendingKey: "s-1:email:secret@example.com",
			tokenHash: "b".repeat(64),
			status: "pending",
			invitedBy: OWNER,
			expiresAt: "2026-12-01T00:00:00.000Z",
			sendCount: 1,
			lastSentAt: "2026-09-01T00:00:00.000Z",
		},
	];

	it("a manager may resend the staff invitation", async () => {
		const payload = seed({ invitations: invitations() });
		asUser(payload, MANAGER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/[invId]/resend/route"
		);
		const response = await POST(
			post("/x"),
			params("s-1", { invId: "inv-staff" }),
		);
		expect(response.status).toBe(200);
	});

	it("isolates team.manageManagers on resend: that manager is refused on the manager invitation", async () => {
		const payload = seed({ invitations: invitations() });
		asUser(payload, MANAGER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/[invId]/resend/route"
		);
		const response = await POST(
			post("/x"),
			params("s-1", { invId: "inv-mgr" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.forbidden" });
	});

	it("isolates team.manageManagers on revoke: the owner may revoke the manager invitation, the manager may not", async () => {
		const payload = seed({ invitations: invitations() });
		asUser(payload, MANAGER);
		const { DELETE } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/[invId]/route"
		);
		const refused = await DELETE(
			del("/x"),
			params("s-1", { invId: "inv-mgr" }),
		);
		expect(refused.status).toBe(403);
		expect(await refused.json()).toMatchObject({ code: "shop.forbidden" });

		asUser(payload, OWNER);
		const allowed = await DELETE(
			del("/x"),
			params("s-1", { invId: "inv-mgr" }),
		);
		expect(allowed.status).toBe(200);
		expect(await allowed.json()).toEqual({ revoked: true });
	});

	it("refuses a staff member on either lever", async () => {
		const payload = seed({ invitations: invitations() });
		asUser(payload, STAFF);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/[invId]/resend/route"
		);
		const response = await POST(
			post("/x"),
			params("s-1", { invId: "inv-staff" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.forbidden" });
	});
});

describe("POST /api/shops/{id}/members/leave", () => {
	it("refuses the owner with team.ownerCannotLeave", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/leave/route"
		);
		const response = await POST(post("/x"), params("s-1"));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: "team.ownerCannotLeave",
		});
	});

	it("lets a manager and a staff member leave", async () => {
		const payload = seed();
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/leave/route"
		);
		asUser(payload, MANAGER);
		expect((await POST(post("/x"), params("s-1"))).status).toBe(200);

		asUser(payload, STAFF);
		expect((await POST(post("/x"), params("s-1"))).status).toBe(200);
	});

	it("refuses a non-member with shop.notMember", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/leave/route"
		);
		const response = await POST(post("/x"), params("s-1"));
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.notMember" });
	});
});

describe("GET /api/shops/{id}/members — masked targets", () => {
	it("never carries the raw phone or email of a pending invitation in the response JSON", async () => {
		const payload = seed({
			invitations: [
				{
					id: "inv-phone",
					shop: "s-1",
					role: "staff",
					channel: "phone",
					phone: "+237612345421",
					email: null,
					pendingKey: "s-1:phone:+237612345421",
					tokenHash: "a".repeat(64),
					status: "pending",
					invitedBy: OWNER,
					expiresAt: "2026-12-01T00:00:00.000Z",
					sendCount: 1,
					lastSentAt: "2026-09-01T00:00:00.000Z",
				},
				{
					id: "inv-email",
					shop: "s-1",
					role: "manager",
					channel: "email",
					phone: null,
					email: "secret@example.com",
					pendingKey: "s-1:email:secret@example.com",
					tokenHash: "b".repeat(64),
					status: "pending",
					invitedBy: OWNER,
					expiresAt: "2026-12-01T00:00:00.000Z",
					sendCount: 1,
					lastSentAt: "2026-09-01T00:00:00.000Z",
				},
			],
		});
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/route"
		);
		const response = await GET(get("/x"), params("s-1"));
		expect(response.status).toBe(200);
		const raw = await response.text();

		expect(raw).not.toContain("+237612345421");
		expect(raw).not.toContain("secret@example.com");
		expect(raw).toContain(maskPhone("+237612345421"));
		expect(raw).toContain(maskEmail("secret@example.com"));
	});
});

describe("GET /api/shops/{id}/activity", () => {
	it("isolates activity.view: refuses a staff member, who lacks it", async () => {
		const payload = seed();
		asUser(payload, STAFF);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/activity/route"
		);
		const response = await GET(get("/x"), params("s-1"));
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.forbidden" });
	});

	it("allows the manager and the owner", async () => {
		const payload = seed();
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/activity/route"
		);
		asUser(payload, MANAGER);
		expect((await GET(get("/x"), params("s-1"))).status).toBe(200);
		asUser(payload, OWNER);
		expect((await GET(get("/x"), params("s-1"))).status).toBe(200);
	});

	it("refuses a non-member with shop.notMember", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/activity/route"
		);
		const response = await GET(get("/x"), params("s-1"));
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.notMember" });
	});
});

describe("GET /api/me/shops", () => {
	it("lists only the shops the caller actually belongs to", async () => {
		const payload = seed();
		const { GET } = await import("../../src/app/(frontend)/api/me/shops/route");

		asUser(payload, OWNER);
		const mine = await GET(get("/x"));
		expect(await mine.json()).toMatchObject([{ shopId: "s-1", role: "owner" }]);

		asUser(payload, OUTSIDER);
		const none = await GET(get("/x"));
		expect(await none.json()).toEqual([]);
	});
});
