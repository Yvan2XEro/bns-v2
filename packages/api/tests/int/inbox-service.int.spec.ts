import { describe, expect, it } from "vitest";
import { inboxFilterWhere, unreadCountFor } from "../../src/lib/inboxFilters";
import {
	assignConversation,
	listShopInbox,
	markConversationRead,
	setConversationStatus,
	startConversation,
} from "../../src/services/inbox";
import { fakePayload } from "./helpers/fakePayload";

function seed() {
	return fakePayload(
		{
			users: [
				{ id: "u-owner", role: "user", name: "Aicha", email: "a@x.com" },
				{ id: "u-mgr", role: "user", name: "Bruno", email: "b@x.com" },
				{ id: "u-staff", role: "user", name: "Clara", email: "c@x.com" },
				{ id: "u-buyer", role: "user", name: "Eve", email: "e@x.com" },
				{ id: "u-buyer2", role: "user", name: "Fanta", email: "f@x.com" },
			],
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					name: "Akwa",
					owner: "u-owner",
					status: "active",
					level: 3,
					levelExpiresAt: null,
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
					id: "m-mgr",
					shop: "s-1",
					user: "u-mgr",
					role: "manager",
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
					images: [],
				},
				{
					id: "l-solo",
					shop: null,
					seller: "u-mgr",
					status: "published",
					title: "Velo",
					images: [],
				},
			],
			conversations: [
				{
					id: "c-open",
					participants: ["u-buyer", "u-owner"],
					shop: "s-1",
					buyer: "u-buyer",
					listing: "l-shop",
					assignee: null,
					inboxStatus: "open",
					awaitingReply: true,
					lastMessage: "msg-1",
					lastMessageAt: "2026-09-03T00:00:00.000Z",
				},
				{
					id: "c-mine",
					participants: ["u-buyer2", "u-owner"],
					shop: "s-1",
					buyer: "u-buyer2",
					listing: "l-shop",
					assignee: "u-staff",
					assignedAt: "2026-09-01T00:00:00.000Z",
					assignedBy: "u-owner",
					inboxStatus: "open",
					awaitingReply: false,
					lastMessage: "msg-2",
					lastMessageAt: "2026-09-02T00:00:00.000Z",
				},
				{
					id: "c-done",
					participants: ["u-buyer", "u-owner"],
					shop: "s-1",
					buyer: "u-buyer",
					listing: null,
					assignee: "u-mgr",
					inboxStatus: "done",
					awaitingReply: false,
					lastMessage: null,
					lastMessageAt: "2026-09-01T00:00:00.000Z",
				},
			],
			messages: [
				{
					id: "msg-1",
					conversation: "c-open",
					sender: "u-buyer",
					senderSide: "buyer",
					content: "bonjour, dispo ?",
					read: false,
					createdAt: "2026-09-03T00:00:00.000Z",
				},
				{
					id: "msg-2",
					conversation: "c-mine",
					sender: "u-staff",
					senderSide: "shop",
					content: "oui",
					read: false,
					createdAt: "2026-09-02T00:00:00.000Z",
				},
			],
			"conversation-reads": [],
			"shop-activity-log": [],
		},
		{ uniques: { "conversation-reads": [["conversation", "user"]] } },
	);
}

const actor = (id: string) => ({
	id,
	role: "user",
	name: null,
	suspendedAt: null,
	suspendedUntil: null,
});

describe("inboxFilterWhere", () => {
	it("maps each filter to the fragment the list narrows on", () => {
		expect(inboxFilterWhere("all", "u-staff")).toBeNull();
		expect(inboxFilterWhere("unassigned", "u-staff")).toEqual({
			assignee: { exists: false },
		});
		expect(inboxFilterWhere("mine", "u-staff")).toEqual({
			assignee: { equals: "u-staff" },
		});
		expect(inboxFilterWhere("awaiting", "u-staff")).toEqual({
			awaitingReply: { equals: true },
		});
		expect(inboxFilterWhere("done", "u-staff")).toEqual({
			inboxStatus: { equals: "done" },
		});
		// `unread` is per-caller and cannot be a Where: it is applied after the read.
		expect(inboxFilterWhere("unread", "u-staff")).toBeNull();
	});
});

describe("unreadCountFor", () => {
	const messages = [
		{ createdAt: "2026-09-01T00:00:00.000Z", sender: "u-buyer" },
		{ createdAt: "2026-09-02T00:00:00.000Z", sender: "u-staff" },
		{ createdAt: "2026-09-03T00:00:00.000Z", sender: "u-buyer" },
	];

	it("counts only messages newer than the mark and sent by someone else", () => {
		expect(
			unreadCountFor(messages, "u-staff", "2026-09-01T12:00:00.000Z"),
		).toBe(1);
	});

	it("counts everything from someone else when there is no mark yet", () => {
		expect(unreadCountFor(messages, "u-staff", null)).toBe(2);
	});

	it("counts nothing once the mark is past the last message", () => {
		expect(
			unreadCountFor(messages, "u-staff", "2026-09-04T00:00:00.000Z"),
		).toBe(0);
	});
});

describe("listShopInbox", () => {
	it("gives a staff member every conversation of the shop, newest first", async () => {
		const payload = seed();
		const page = await listShopInbox(payload, actor("u-staff"), "s-1");
		expect(page.docs.map((d) => d.id)).toEqual(["c-open", "c-mine", "c-done"]);
	});

	it("shapes the buyer, the listing, the preview and the side", async () => {
		const payload = seed();
		const page = await listShopInbox(payload, actor("u-staff"), "s-1");
		expect(page.docs[0]).toMatchObject({
			buyer: { id: "u-buyer", name: "Eve" },
			listing: { id: "l-shop", title: "Sac" },
			lastMessage: {
				preview: "bonjour, dispo ?",
				at: "2026-09-03T00:00:00.000Z",
				side: "buyer",
			},
			inboxStatus: "open",
			awaitingReply: true,
			unreadCount: 1,
		});
	});

	it("counts per caller: the sender's own message is not unread for them", async () => {
		const payload = seed();
		const page = await listShopInbox(payload, actor("u-staff"), "s-1");
		expect(page.docs.find((d) => d.id === "c-mine")?.unreadCount).toBe(0);
	});

	it("honours the five server-side filters and the per-caller unread one", async () => {
		const payload = seed();
		const of = async (
			filter: Parameters<typeof listShopInbox>[3] extends undefined
				? never
				: "unassigned" | "mine" | "awaiting" | "done" | "unread",
		) =>
			(
				await listShopInbox(payload, actor("u-staff"), "s-1", { filter })
			).docs.map((d) => d.id);
		expect(await of("unassigned")).toEqual(["c-open"]);
		expect(await of("mine")).toEqual(["c-mine"]);
		expect(await of("awaiting")).toEqual(["c-open"]);
		expect(await of("done")).toEqual(["c-done"]);
		expect(await of("unread")).toEqual(["c-open"]);
	});

	it("reports a total per filter", async () => {
		const payload = seed();
		const page = await listShopInbox(payload, actor("u-staff"), "s-1");
		expect(page.totals).toEqual({
			all: 3,
			unassigned: 1,
			mine: 1,
			unread: 1,
			awaiting: 1,
			done: 1,
		});
	});

	it("searches the buyer's name and the listing title", async () => {
		const payload = seed();
		expect(
			(
				await listShopInbox(payload, actor("u-staff"), "s-1", { q: "fanta" })
			).docs.map((d) => d.id),
		).toEqual(["c-mine"]);
		expect(
			(await listShopInbox(payload, actor("u-staff"), "s-1", { q: "sac" })).docs
				.map((d) => d.id)
				.sort(),
		).toEqual(["c-mine", "c-open"]);
	});

	// Review Focus 5.
	it("keeps a suspended assignee's assignment and flags it, and does not call it unassigned", async () => {
		const payload = seed();
		payload.store.users[2].suspendedAt = "2026-09-01T00:00:00.000Z";
		payload.store.users[2].suspendedUntil = null;
		const page = await listShopInbox(payload, actor("u-owner"), "s-1");
		const mine = page.docs.find((d) => d.id === "c-mine");
		expect(mine?.assignee).toMatchObject({
			id: "u-staff",
			name: "Clara",
			suspended: true,
		});
		expect(page.totals.unassigned).toBe(1);
		expect(
			(
				await listShopInbox(payload, actor("u-owner"), "s-1", {
					filter: "unassigned",
				})
			).docs.map((d) => d.id),
		).toEqual(["c-open"]);
	});

	it("refuses someone with no inbox.reply in the shop", async () => {
		const payload = seed();
		await expect(
			listShopInbox(payload, actor("u-buyer"), "s-1"),
		).rejects.toMatchObject({ code: "shop.notMember", status: 403 });
	});
});

describe("assignConversation", () => {
	it("lets a staff member assign themselves and logs it", async () => {
		const payload = seed();
		const view = await assignConversation(
			payload,
			actor("u-staff"),
			"c-open",
			"u-staff",
		);
		expect(view.assignee).toMatchObject({ id: "u-staff" });
		expect(payload.store["shop-activity-log"]).toMatchObject([
			{
				action: "conversation.assigned",
				targetType: "conversation",
				targetId: "c-open",
				metadata: {
					before: { assignee: null },
					after: { assignee: "u-staff" },
				},
			},
		]);
	});

	it("lets a staff member unassign themselves", async () => {
		const payload = seed();
		const view = await assignConversation(
			payload,
			actor("u-staff"),
			"c-mine",
			null,
		);
		expect(view.assignee).toBeNull();
	});

	it("refuses a staff member assigning someone else", async () => {
		const payload = seed();
		await expect(
			assignConversation(payload, actor("u-staff"), "c-open", "u-mgr"),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
	});

	it("refuses a staff member unassigning someone else's conversation", async () => {
		const payload = seed();
		payload.store.conversations[0].assignee = "u-mgr";
		await expect(
			assignConversation(payload, actor("u-staff"), "c-open", null),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
	});

	it("lets a manager assign anyone who holds inbox.reply", async () => {
		const payload = seed();
		const view = await assignConversation(
			payload,
			actor("u-mgr"),
			"c-open",
			"u-staff",
		);
		expect(view.assignee).toMatchObject({ id: "u-staff" });
	});

	it("refuses an assignee who is not a member, or is suspended", async () => {
		const payload = seed();
		await expect(
			assignConversation(payload, actor("u-mgr"), "c-open", "u-buyer"),
		).rejects.toMatchObject({ code: "inbox.notAssignable", status: 409 });
		payload.store.users[2].suspendedAt = "2026-09-01T00:00:00.000Z";
		payload.store.users[2].suspendedUntil = null;
		await expect(
			assignConversation(payload, actor("u-mgr"), "c-open", "u-staff"),
		).rejects.toMatchObject({ code: "inbox.notAssignable", status: 409 });
	});

	it("refuses a suspended caller before it looks at the assignee", async () => {
		const payload = seed();
		payload.store.users[2].suspendedAt = "2026-09-01T00:00:00.000Z";
		payload.store.users[2].suspendedUntil = null;
		await expect(
			assignConversation(payload, actor("u-staff"), "c-open", "u-staff"),
		).rejects.toMatchObject({ code: "shop.notMember", status: 403 });
	});

	it("refuses a classic conversation, which has no inbox", async () => {
		const payload = seed();
		payload.store.conversations.push({
			id: "c-solo",
			participants: ["u-buyer", "u-mgr"],
			shop: null,
			buyer: null,
			listing: "l-solo",
			inboxStatus: "open",
		});
		await expect(
			assignConversation(payload, actor("u-mgr"), "c-solo", "u-mgr"),
		).rejects.toMatchObject({ code: "generic.notFound", status: 404 });
	});

	// Review Focus 4.
	it("gives one winner and one log entry when two members assign at once", async () => {
		const payload = seed();
		const results = await Promise.allSettled([
			assignConversation(payload, actor("u-mgr"), "c-open", "u-mgr"),
			assignConversation(payload, actor("u-owner"), "c-open", "u-owner"),
		]);
		expect(results.every((r) => r.status === "fulfilled")).toBe(true);
		const winner = payload.store.conversations[0].assignee;
		expect(["u-mgr", "u-owner"]).toContain(winner);
		// Exactly one write landed, so exactly one entry describes it, and both
		// callers were told who actually holds it.
		expect(
			payload.store["shop-activity-log"].filter(
				(e) => e.action === "conversation.assigned",
			),
		).toHaveLength(1);
		for (const result of results) {
			if (result.status === "fulfilled") {
				expect(result.value.assignee?.id).toBe(winner);
			}
		}
	});
});

describe("setConversationStatus", () => {
	it("marks done and reopens, logging each change", async () => {
		const payload = seed();
		await setConversationStatus(payload, actor("u-staff"), "c-open", "done");
		expect(payload.store.conversations[0].inboxStatus).toBe("done");
		await setConversationStatus(payload, actor("u-staff"), "c-open", "open");
		expect(payload.store.conversations[0].inboxStatus).toBe("open");
		expect(
			payload.store["shop-activity-log"].filter(
				(e) => e.action === "conversation.status_changed",
			),
		).toHaveLength(2);
	});

	it("writes nothing when the status is already what was asked for", async () => {
		const payload = seed();
		await setConversationStatus(payload, actor("u-staff"), "c-done", "done");
		expect(payload.store["shop-activity-log"]).toHaveLength(0);
	});
});

describe("markConversationRead", () => {
	it("upserts the caller's mark and marks the other side's messages read", async () => {
		const payload = seed();
		const result = await markConversationRead(
			payload,
			{ id: "u-staff", isService: false },
			"c-open",
			{ lastMessageId: "msg-1" },
		);
		expect(result).toMatchObject({
			lastReadAt: "2026-09-03T00:00:00.000Z",
			unreadCount: 0,
		});
		expect(payload.store["conversation-reads"]).toMatchObject([
			{
				conversation: "c-open",
				user: "u-staff",
				lastReadAt: "2026-09-03T00:00:00.000Z",
				lastReadMessage: "msg-1",
			},
		]);
		expect(payload.store.messages.find((m) => m.id === "msg-1")?.read).toBe(
			true,
		);
	});

	it("does not mark the caller's own messages read", async () => {
		const payload = seed();
		await markConversationRead(
			payload,
			{ id: "u-staff", isService: false },
			"c-mine",
			{
				lastMessageId: "msg-2",
			},
		);
		expect(payload.store.messages.find((m) => m.id === "msg-2")?.read).toBe(
			false,
		);
	});

	it("updates the same row a second time rather than creating another", async () => {
		const payload = seed();
		await markConversationRead(
			payload,
			{ id: "u-staff", isService: false },
			"c-open",
			{ lastMessageId: "msg-1" },
		);
		await markConversationRead(
			payload,
			{ id: "u-staff", isService: false },
			"c-open",
			{ lastMessageId: "msg-1" },
		);
		expect(payload.store["conversation-reads"]).toHaveLength(1);
	});

	it("works for a classic conversation, which is the web mark-read fix", async () => {
		const payload = seed();
		payload.store.conversations.push({
			id: "c-solo",
			participants: ["u-buyer", "u-mgr"],
			shop: null,
			buyer: null,
			listing: "l-solo",
			inboxStatus: "open",
		});
		payload.store.messages.push({
			id: "msg-3",
			conversation: "c-solo",
			sender: "u-buyer",
			content: "hi",
			read: false,
			createdAt: "2026-09-05T00:00:00.000Z",
		});
		await markConversationRead(
			payload,
			{ id: "u-mgr", isService: false },
			"c-solo",
			{ lastMessageId: "msg-3" },
		);
		expect(payload.store.messages.find((m) => m.id === "msg-3")?.read).toBe(
			true,
		);
	});

	it("lets the service token name the user, and refuses a non-service caller who tries", async () => {
		const payload = seed();
		await markConversationRead(
			payload,
			{ id: "chat", isService: true },
			"c-open",
			{
				lastMessageId: "msg-1",
				userId: "u-staff",
			},
		);
		expect(payload.store["conversation-reads"][0].user).toBe("u-staff");
		await expect(
			markConversationRead(
				payload,
				{ id: "u-mgr", isService: false },
				"c-open",
				{
					lastMessageId: "msg-1",
					userId: "u-staff",
				},
			),
		).rejects.toMatchObject({ code: "generic.forbidden", status: 403 });
	});

	it("refuses someone with neither participation nor inbox.reply", async () => {
		const payload = seed();
		await expect(
			markConversationRead(
				payload,
				{ id: "u-buyer2", isService: false },
				"c-open",
				{
					lastMessageId: "msg-1",
				},
			),
		).rejects.toMatchObject({ code: "messages.notParticipant", status: 403 });
	});

	it("refuses a message that belongs to another conversation", async () => {
		const payload = seed();
		await expect(
			markConversationRead(
				payload,
				{ id: "u-staff", isService: false },
				"c-open",
				{
					lastMessageId: "msg-2",
				},
			),
		).rejects.toMatchObject({ code: "generic.badRequest", status: 400 });
	});
});

describe("startConversation", () => {
	it("returns the existing conversation for (shop, buyer) rather than a second one", async () => {
		const payload = seed();
		const result = await startConversation(payload, actor("u-buyer"), "l-shop");
		expect(result).toEqual({ conversationId: "c-open", created: false });
		expect(payload.store.conversations).toHaveLength(3);
	});

	it("creates one when the buyer has never written to that shop", async () => {
		const payload = seed();
		const result = await startConversation(
			payload,
			actor("u-buyer2"),
			"l-shop",
		);
		expect(result.created).toBe(false);
		expect(result.conversationId).toBe("c-mine");

		payload.store.conversations = payload.store.conversations.filter(
			(c) => c.id !== "c-mine",
		);
		const fresh = await startConversation(payload, actor("u-buyer2"), "l-shop");
		expect(fresh.created).toBe(true);
		const created = payload.store.conversations.find(
			(c) => c.id === fresh.conversationId,
		);
		expect(created).toMatchObject({
			shop: "s-1",
			buyer: "u-buyer2",
			participants: ["u-buyer2", "u-owner"],
		});
	});

	it("dedupes by (shop, buyer), not by listing: a second listing of the same shop reuses the thread", async () => {
		const payload = seed();
		payload.store.listings.push({
			id: "l-shop2",
			shop: "s-1",
			seller: "u-owner",
			status: "published",
			title: "Ceinture",
			images: [],
		});
		const result = await startConversation(
			payload,
			actor("u-buyer"),
			"l-shop2",
		);
		expect(result).toEqual({ conversationId: "c-open", created: false });
	});

	it("falls back to find-or-create by participants for a classic listing", async () => {
		const payload = seed();
		const first = await startConversation(payload, actor("u-buyer"), "l-solo");
		expect(first.created).toBe(true);
		const second = await startConversation(payload, actor("u-buyer"), "l-solo");
		expect(second).toEqual({
			conversationId: first.conversationId,
			created: false,
		});
	});

	it("refuses a member starting a conversation with their own shop", async () => {
		const payload = seed();
		await expect(
			startConversation(payload, actor("u-staff"), "l-shop"),
		).rejects.toMatchObject({ code: "messages.notParticipant", status: 403 });
	});

	it("refuses a suspended shop", async () => {
		const payload = seed();
		payload.store.shops[0].status = "suspended";
		await expect(
			startConversation(payload, actor("u-buyer2"), "l-shop"),
		).rejects.toMatchObject({ code: "shop.inactive", status: 409 });
	});

	it("refuses an unknown listing", async () => {
		const payload = seed();
		await expect(
			startConversation(payload, actor("u-buyer"), "l-nope"),
		).rejects.toMatchObject({ code: "listing.notFound", status: 404 });
	});
});
