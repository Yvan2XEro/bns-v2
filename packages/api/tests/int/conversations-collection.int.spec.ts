import { describe, expect, it } from "vitest";
import { ConversationReads } from "../../src/collections/ConversationReads";
import { Conversations } from "../../src/collections/Conversations";
import { fakePayload } from "./helpers/fakePayload";

type Hook = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
const beforeChange = (Conversations.hooks?.beforeChange as Hook[])[0];

function seed(over: Record<string, unknown> = {}) {
	return fakePayload({
		users: [
			{ id: "u-owner", role: "user", name: "Aicha" },
			{ id: "u-staff", role: "user", name: "Bruno" },
			{ id: "u-buyer", role: "user", name: "Clara" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa",
				owner: "u-owner",
				status: "active",
				level: 2,
				levelExpiresAt: null,
				...over,
			},
		],
		"shop-members": [
			{
				id: "m-owner",
				shop: "s-1",
				user: "u-owner",
				role: "owner",
				status: "active",
				inboxNotifications: "all",
			},
			{
				id: "m-staff",
				shop: "s-1",
				user: "u-staff",
				role: "staff",
				status: "active",
				inboxNotifications: "assigned",
			},
		],
		listings: [
			{
				id: "l-shop",
				shop: "s-1",
				seller: "u-owner",
				status: "published",
				title: "Sac",
			},
			{
				id: "l-solo",
				shop: null,
				seller: "u-owner",
				status: "published",
				title: "Velo",
			},
		],
		conversations: [],
	});
}

const req = (payload: ReturnType<typeof seed>, userId: string | null) =>
	({
		payload,
		context: {},
		user: userId ? { id: userId, role: "user" } : null,
	}) as never;

describe("Conversations.beforeChange on create", () => {
	it("refuses a caller who is not among the participants", async () => {
		const payload = seed();
		await expect(
			beforeChange({
				req: req(payload, "u-staff"),
				operation: "create",
				data: { participants: ["u-buyer", "u-owner"], listing: "l-shop" },
			}),
		).rejects.toMatchObject({ data: { code: "messages.notParticipant" } });
	});

	it("sets shop, buyer and [buyer, owner] for a shop listing", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: req(payload, "u-buyer"),
			operation: "create",
			data: { participants: ["u-buyer", "u-owner"], listing: "l-shop" },
		});
		expect(data).toMatchObject({
			shop: "s-1",
			buyer: "u-buyer",
			participants: ["u-buyer", "u-owner"],
			inboxStatus: "open",
			awaitingReply: false,
		});
	});

	it("rewrites participants to [buyer, owner] even when the caller listed someone else", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: req(payload, "u-buyer"),
			operation: "create",
			data: { participants: ["u-buyer", "u-staff"], listing: "l-shop" },
		});
		expect(data.participants).toEqual(["u-buyer", "u-owner"]);
	});

	it("leaves a classic listing's conversation untouched", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: req(payload, "u-buyer"),
			operation: "create",
			data: { participants: ["u-buyer", "u-owner"], listing: "l-solo" },
		});
		expect(data.shop).toBeUndefined();
		expect(data.buyer).toBeUndefined();
		expect(data.participants).toEqual(["u-buyer", "u-owner"]);
	});

	// This case exists to ISOLATE the participants guard. The suite's other
	// refusals all use a caller who is also a shop member, so the "no
	// conversation with your own shop" role check refuses them too — disabling
	// the participants guard left every one of them green. Here the caller is
	// neither a participant nor a member, and there is no `listing`, so the
	// hook returns before it ever looks up a shop. Only the participants guard
	// can refuse this, and it must.
	it("refuses a caller who puts two other people in participants", async () => {
		const payload = seed();
		await expect(
			beforeChange({
				req: req(payload, "u-buyer"),
				operation: "create",
				data: { participants: ["u-owner", "u-staff"] },
			}),
		).rejects.toMatchObject({ data: { code: "messages.notParticipant" } });
	});

	it("refuses a member opening a shop conversation with their own shop", async () => {
		const payload = seed();
		await expect(
			beforeChange({
				req: req(payload, "u-staff"),
				operation: "create",
				data: { participants: ["u-staff", "u-owner"], listing: "l-shop" },
			}),
		).rejects.toMatchObject({ data: { code: "messages.notParticipant" } });
	});

	it("refuses a shop conversation on a suspended shop", async () => {
		const payload = seed({ status: "suspended" });
		await expect(
			beforeChange({
				req: req(payload, "u-buyer"),
				operation: "create",
				data: { participants: ["u-buyer", "u-owner"], listing: "l-shop" },
			}),
		).rejects.toMatchObject({ data: { code: "shop.inactive" } });
	});
});

describe("Conversations.beforeChange on update", () => {
	const original = {
		id: "c-1",
		participants: ["u-buyer", "u-owner"],
		shop: "s-1",
		buyer: "u-buyer",
		assignee: "u-owner",
		assignedAt: "2026-10-01T00:00:00.000Z",
		assignedBy: "u-owner",
		inboxStatus: "open",
		awaitingReply: true,
		lastMessage: "msg-1",
		lastMessageAt: "2026-10-01T00:00:00.000Z",
	};

	it("pins every inbox field against a REST update", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: req(payload, "u-buyer"),
			operation: "update",
			originalDoc: original,
			data: {
				participants: ["u-buyer", "u-buyer2"],
				shop: "s-2",
				buyer: "u-buyer2",
				assignee: "u-staff",
				assignedAt: "2026-10-09T00:00:00.000Z",
				assignedBy: "u-buyer",
				inboxStatus: "done",
				awaitingReply: false,
				lastMessage: "msg-2",
			},
		});
		expect(data).toMatchObject({
			participants: ["u-buyer", "u-owner"],
			shop: "s-1",
			buyer: "u-buyer",
			assignee: "u-owner",
			assignedAt: "2026-10-01T00:00:00.000Z",
			assignedBy: "u-owner",
			inboxStatus: "open",
			awaitingReply: true,
			// chat-service updates these two under its own token.
			lastMessage: "msg-2",
		});
	});

	// This case ISOLATES the rule the test above cannot see: `original` there
	// carries all eight pinned keys, so `field in originalDoc` is always true
	// and a pin that only fires when the key already exists passes unnoticed.
	// Mongo stores no key at all for an unset relationship, so a classic
	// conversation has neither `shop` nor `buyer`, and an unassigned shop
	// conversation has no `assignee`/`assignedAt`/`assignedBy`. This fixture
	// omits exactly those three to match the unassigned-shop-conversation
	// case, and a participant tries to write all three through a PATCH.
	it("pins assignee, shop and buyer even when the stored document has no such key", async () => {
		const payload = seed();
		const originalWithoutOptionalKeys = {
			id: "c-2",
			participants: ["u-buyer", "u-owner"],
			inboxStatus: "open",
			awaitingReply: false,
		};
		const data = await beforeChange({
			req: req(payload, "u-buyer"),
			operation: "update",
			originalDoc: originalWithoutOptionalKeys,
			data: {
				shop: "s-2",
				buyer: "u-buyer2",
				assignee: "u-outsider",
				assignedAt: "2026-10-09T00:00:00.000Z",
				assignedBy: "u-buyer",
			},
		});
		expect(data.shop).toBeNull();
		expect(data.buyer).toBeNull();
		expect(data.assignee).toBeNull();
		expect(data.assignedAt).toBeNull();
		expect(data.assignedBy).toBeNull();
	});

	it("lets the inbox service through", async () => {
		const payload = seed();
		const serviceReq = {
			payload,
			context: { inboxService: true },
			user: null,
		} as never;
		const data = await beforeChange({
			req: serviceReq,
			operation: "update",
			originalDoc: original,
			data: { assignee: "u-staff", inboxStatus: "done" },
		});
		expect(data).toMatchObject({ assignee: "u-staff", inboxStatus: "done" });
	});
});

describe("Conversations.access.read", () => {
	const args = (userId: string) =>
		({
			req: {
				user: { id: userId, role: "user" },
				context: {},
				payload: seed(),
			},
		}) as never;

	it("lets a staff member read their shop's conversations without being a participant", async () => {
		const where = await Conversations.access?.read?.(args("u-staff"));
		expect(where).toEqual({
			or: [{ participants: { equals: "u-staff" } }, { shop: { in: ["s-1"] } }],
		});
	});

	it("gives a buyer only their own conversations", async () => {
		const where = await Conversations.access?.read?.(args("u-buyer"));
		expect(where).toEqual({ participants: { equals: "u-buyer" } });
	});
});

describe("conversation-reads", () => {
	it("is readable only by the user it belongs to, and never writable by a request", () => {
		const args = (userId: string | null, role = "user") =>
			({ req: { user: userId ? { id: userId, role } : null } }) as never;
		expect(ConversationReads.access?.read?.(args(null))).toBe(false);
		expect(ConversationReads.access?.read?.(args("u-staff"))).toEqual({
			user: { equals: "u-staff" },
		});
		expect(ConversationReads.access?.create?.(args("u-staff"))).toBe(false);
		expect(ConversationReads.access?.update?.(args("u-staff"))).toBe(false);
		expect(ConversationReads.access?.delete?.(args("u-staff"))).toBe(false);
	});

	it("is unique per (conversation, user)", () => {
		expect(ConversationReads.indexes).toEqual([
			{ fields: ["conversation", "user"], unique: true },
		]);
	});
});
