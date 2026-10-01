import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = {
	payload: {} as never,
	user: {
		id: "u-owner",
		role: "user",
		name: null,
		suspendedAt: null,
		suspendedUntil: null,
	},
};

vi.mock("../../src/lib/shopRoute", async () => {
	const actual = await vi.importActual<
		typeof import("../../src/lib/shopRoute")
	>("../../src/lib/shopRoute");
	return { ...actual, requireUser: vi.fn(async () => ctx) };
});

const members = {
	getShopTeam: vi.fn(async () => ({
		members: [],
		invitations: [],
		activeCount: 1,
		maxMembers: 5,
		teamMembers: true,
	})),
	inviteMember: vi.fn(async () => ({
		invitation: { id: "inv-1" },
		delivered: true,
	})),
	resendInvitation: vi.fn(async () => ({
		invitation: { id: "inv-1" },
		delivered: false,
	})),
	revokeInvitation: vi.fn(async () => ({ revoked: true })),
	changeMemberRole: vi.fn(async () => ({ id: "m-1", role: "manager" })),
	removeMember: vi.fn(async () => ({ removed: true })),
	leaveShop: vi.fn(async () => ({ left: true })),
	updateMyMemberPreferences: vi.fn(async () => ({
		id: "m-1",
		inboxNotifications: "none",
	})),
	listMyShops: vi.fn(async () => [{ shopId: "s-1" }]),
};
vi.mock("../../src/services/shopMembers", () => members);

const activity = {
	listShopActivity: vi.fn(async () => ({ docs: [], nextCursor: null })),
};
vi.mock("../../src/services/shopActivity", async () => {
	const actual = await vi.importActual<
		typeof import("../../src/services/shopActivity")
	>("../../src/services/shopActivity");
	return { ...actual, ...activity };
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
const post = (body: unknown) =>
	new Request("http://localhost/x", {
		method: "POST",
		body: JSON.stringify(body),
	});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/shops/{id}/members", () => {
	it("answers the team view", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/route"
		);
		const response = await GET(
			new Request("http://localhost/x"),
			params("s-1"),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ maxMembers: 5 });
		expect(members.getShopTeam).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"s-1",
		);
	});

	it("rejects a blank shop id with generic.badRequest", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/route"
		);
		const response = await GET(new Request("http://localhost/x"), params("  "));
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "generic.badRequest" });
	});
});

describe("POST /api/shops/{id}/invitations", () => {
	it("passes the body through and answers 201", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/route"
		);
		const response = await POST(
			post({ channel: "phone", phone: "+237612345421", role: "staff" }),
			params("s-1"),
		);
		expect(response.status).toBe(201);
		expect(members.inviteMember).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"s-1",
			{
				channel: "phone",
				phone: "+237612345421",
				email: undefined,
				role: "staff",
			},
		);
	});

	it("refuses a channel that is not phone or email before touching the service", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/route"
		);
		const response = await POST(
			post({ channel: "pigeon", role: "staff" }),
			params("s-1"),
		);
		expect(response.status).toBe(400);
		expect(members.inviteMember).not.toHaveBeenCalled();
	});

	it("refuses a role that is not manager or staff", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/route"
		);
		const response = await POST(
			post({ channel: "email", email: "a@b.com", role: "owner" }),
			params("s-1"),
		);
		expect(response.status).toBe(400);
		expect(members.inviteMember).not.toHaveBeenCalled();
	});
});

describe("the invitation levers", () => {
	it("resends", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/[invId]/resend/route"
		);
		const response = await POST(post({}), params("s-1", { invId: "inv-1" }));
		expect(response.status).toBe(200);
		expect(members.resendInvitation).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"s-1",
			"inv-1",
		);
	});

	it("revokes", async () => {
		const { DELETE } = await import(
			"../../src/app/(frontend)/api/shops/[id]/invitations/[invId]/route"
		);
		const response = await DELETE(
			new Request("http://localhost/x", { method: "DELETE" }),
			params("s-1", { invId: "inv-1" }),
		);
		expect(response.status).toBe(200);
		expect(members.revokeInvitation).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"s-1",
			"inv-1",
		);
	});
});

describe("the member levers", () => {
	it("changes a role", async () => {
		const { PATCH } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await PATCH(
			new Request("http://localhost/x", {
				method: "PATCH",
				body: JSON.stringify({ role: "manager" }),
			}),
			params("s-1", { memberId: "m-1" }),
		);
		expect(response.status).toBe(200);
		expect(members.changeMemberRole).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"s-1",
			"m-1",
			"manager",
		);
	});

	it("removes", async () => {
		const { DELETE } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/[memberId]/route"
		);
		const response = await DELETE(
			new Request("http://localhost/x", { method: "DELETE" }),
			params("s-1", { memberId: "m-1" }),
		);
		expect(response.status).toBe(200);
		expect(members.removeMember).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"s-1",
			"m-1",
		);
	});

	it("leaves", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/leave/route"
		);
		const response = await POST(post({}), params("s-1"));
		expect(response.status).toBe(200);
		expect(members.leaveShop).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"s-1",
		);
	});

	it("updates the caller's own preference and refuses an unknown value", async () => {
		const { PATCH } = await import(
			"../../src/app/(frontend)/api/shops/[id]/members/me/route"
		);
		const ok = await PATCH(
			new Request("http://localhost/x", {
				method: "PATCH",
				body: JSON.stringify({ inboxNotifications: "none" }),
			}),
			params("s-1"),
		);
		expect(ok.status).toBe(200);
		const bad = await PATCH(
			new Request("http://localhost/x", {
				method: "PATCH",
				body: JSON.stringify({ inboxNotifications: "maybe" }),
			}),
			params("s-1"),
		);
		expect(bad.status).toBe(400);
	});
});

describe("GET /api/shops/{id}/activity", () => {
	it("passes the three filters and the cursor through", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/activity/route"
		);
		const response = await GET(
			new Request(
				"http://localhost/x?actor=u-staff&action=stock.moved&targetType=variant&cursor=2026-09-01T00:00:00.000Z",
			),
			params("s-1"),
		);
		expect(response.status).toBe(200);
		expect(activity.listShopActivity).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"s-1",
			{
				actor: "u-staff",
				action: "stock.moved",
				targetType: "variant",
				cursor: "2026-09-01T00:00:00.000Z",
			},
		);
	});

	it("refuses an action that is not in the enum", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/activity/route"
		);
		const response = await GET(
			new Request("http://localhost/x?action=member.bribed"),
			params("s-1"),
		);
		expect(response.status).toBe(400);
		expect(activity.listShopActivity).not.toHaveBeenCalled();
	});
});

describe("GET /api/me/shops", () => {
	it("answers the caller's shops", async () => {
		const { GET } = await import("../../src/app/(frontend)/api/me/shops/route");
		const response = await GET(new Request("http://localhost/x"));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([{ shopId: "s-1" }]);
	});
});
