import { beforeEach, describe, expect, it, vi } from "vitest";

let currentUser = {
	id: "u-staff",
	role: "user",
	name: null,
	suspendedAt: null,
	suspendedUntil: null,
	email: "c@x.com",
};
const ctx = {
	payload: {} as never,
	get user() {
		return currentUser;
	},
};

vi.mock("../../src/lib/shopRoute", async () => {
	const actual = await vi.importActual<
		typeof import("../../src/lib/shopRoute")
	>("../../src/lib/shopRoute");
	return { ...actual, requireUser: vi.fn(async () => ctx) };
});

const inbox = {
	listShopInbox: vi.fn(async () => ({
		docs: [],
		nextCursor: null,
		totals: {},
	})),
	assignConversation: vi.fn(async () => ({ id: "c-1" })),
	setConversationStatus: vi.fn(async () => ({ id: "c-1" })),
	markConversationRead: vi.fn(async () => ({
		lastReadAt: "2026-09-03T00:00:00.000Z",
		unreadCount: 0,
	})),
	startConversation: vi.fn(async () => ({
		conversationId: "c-1",
		created: false,
	})),
};
vi.mock("../../src/services/inbox", () => inbox);

const membersService = {
	inboxMemberIds: vi.fn(async () => ["u-owner", "u-staff"]),
};
vi.mock("../../src/services/shopMembers", () => membersService);

const params = (extra: { id: string }) => ({ params: Promise.resolve(extra) });
const post = (body: unknown) =>
	new Request("http://localhost/x", {
		method: "POST",
		body: JSON.stringify(body),
	});

beforeEach(() => {
	vi.clearAllMocks();
	currentUser = {
		id: "u-staff",
		role: "user",
		name: null,
		suspendedAt: null,
		suspendedUntil: null,
		email: "c@x.com",
	};
	process.env.CHAT_SERVICE_EMAIL = "chat@buynsellem.com";
});

describe("GET /api/shops/{id}/inbox", () => {
	it("passes the filter, the query and the cursor through", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/inbox/route"
		);
		const response = await GET(
			new Request(
				"http://localhost/x?filter=unread&q=sac&cursor=2026-09-01T00:00:00.000Z",
			),
			params({ id: "s-1" }),
		);
		expect(response.status).toBe(200);
		expect(inbox.listShopInbox).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"s-1",
			{
				filter: "unread",
				q: "sac",
				cursor: "2026-09-01T00:00:00.000Z",
			},
		);
	});

	it("refuses a filter outside the six", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/inbox/route"
		);
		const response = await GET(
			new Request("http://localhost/x?filter=spam"),
			params({ id: "s-1" }),
		);
		expect(response.status).toBe(400);
		expect(inbox.listShopInbox).not.toHaveBeenCalled();
	});
});

describe("the conversation levers", () => {
	it("assigns, accepting a null userId", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/conversations/[id]/assign/route"
		);
		expect(
			(await POST(post({ userId: "u-mgr" }), params({ id: "c-1" }))).status,
		).toBe(200);
		expect(inbox.assignConversation).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"c-1",
			"u-mgr",
		);
		expect(
			(await POST(post({ userId: null }), params({ id: "c-1" }))).status,
		).toBe(200);
		expect(inbox.assignConversation).toHaveBeenLastCalledWith(
			ctx.payload,
			ctx.user,
			"c-1",
			null,
		);
	});

	it("refuses an assign body with no userId key at all", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/conversations/[id]/assign/route"
		);
		expect((await POST(post({}), params({ id: "c-1" }))).status).toBe(400);
	});

	it("sets a status and refuses anything but open or done", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/conversations/[id]/status/route"
		);
		expect(
			(await POST(post({ status: "done" }), params({ id: "c-1" }))).status,
		).toBe(200);
		expect(
			(await POST(post({ status: "snoozed" }), params({ id: "c-1" }))).status,
		).toBe(400);
	});

	it("marks read, and ignores a userId from a caller that is not the service account", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/conversations/[id]/read/route"
		);
		await POST(
			post({ lastMessageId: "msg-1", userId: "u-owner" }),
			params({ id: "c-1" }),
		);
		expect(inbox.markConversationRead).toHaveBeenCalledWith(
			ctx.payload,
			{ id: "u-staff", isService: false },
			"c-1",
			{ lastMessageId: "msg-1", userId: "u-owner" },
		);
	});

	it("flags the chat-service account as the service caller", async () => {
		currentUser = {
			...currentUser,
			id: "u-chat",
			email: "chat@buynsellem.com",
		};
		const { POST } = await import(
			"../../src/app/(frontend)/api/conversations/[id]/read/route"
		);
		await POST(
			post({ lastMessageId: "msg-1", userId: "u-owner" }),
			params({ id: "c-1" }),
		);
		expect(inbox.markConversationRead).toHaveBeenCalledWith(
			ctx.payload,
			{ id: "u-chat", isService: true },
			"c-1",
			{ lastMessageId: "msg-1", userId: "u-owner" },
		);
	});
});

describe("POST /api/conversations/start", () => {
	it("takes a listingId and answers the conversation id", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/conversations/start/route"
		);
		const response = await POST(post({ listingId: "l-shop" }));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			conversationId: "c-1",
			created: false,
		});
	});

	it("refuses a body with no listingId", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/conversations/start/route"
		);
		expect((await POST(post({}))).status).toBe(400);
	});
});

describe("GET /api/internal/shops/{id}/inbox-members", () => {
	it("answers the chat-service account", async () => {
		currentUser = {
			...currentUser,
			id: "u-chat",
			email: "chat@buynsellem.com",
		};
		const { GET } = await import(
			"../../src/app/(frontend)/api/internal/shops/[id]/inbox-members/route"
		);
		const response = await GET(
			new Request("http://localhost/x"),
			params({ id: "s-1" }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ userIds: ["u-owner", "u-staff"] });
	});

	it("refuses an ordinary member with generic.forbidden", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/internal/shops/[id]/inbox-members/route"
		);
		const response = await GET(
			new Request("http://localhost/x"),
			params({ id: "s-1" }),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "generic.forbidden" });
		expect(membersService.inboxMemberIds).not.toHaveBeenCalled();
	});

	it("refuses an admin too: the route is for one account, not for a role", async () => {
		currentUser = {
			...currentUser,
			id: "u-admin",
			role: "admin",
			email: "admin@x.com",
		};
		const { GET } = await import(
			"../../src/app/(frontend)/api/internal/shops/[id]/inbox-members/route"
		);
		expect(
			(await GET(new Request("http://localhost/x"), params({ id: "s-1" })))
				.status,
		).toBe(403);
	});
});
