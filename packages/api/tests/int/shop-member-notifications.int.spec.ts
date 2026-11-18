import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { fakePayload } from "./helpers/fakePayload";

const triggers: Array<{
	event: string;
	subscriberId: string;
	payload: Record<string, unknown>;
	email?: string;
}> = [];
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async (args: (typeof triggers)[number]) => {
		triggers.push(args);
	}),
}));
vi.mock("../../src/services/notificationProvider", () => ({
	isNotificationProviderConfigured: () => true,
	getNotificationProvider: () => ({}),
}));

const NOW = Date.parse("2026-10-01T10:00:00.000Z");

function seed(over: { assignee?: string | null } = {}) {
	return fakePayload({
		users: [
			{
				id: "u-owner",
				role: "user",
				name: "Aicha",
				email: "aicha@example.com",
			},
			{ id: "u-mgr", role: "user", name: "Bruno", email: "bruno@example.com" },
			{
				id: "u-staff",
				role: "user",
				name: "Clara",
				email: "clara@example.com",
			},
			{ id: "u-quiet", role: "user", name: "Dede", email: "dede@example.com" },
			{ id: "u-buyer", role: "user", name: "Eve", email: "eve@example.com" },
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
			{
				id: "m-quiet",
				shop: "s-1",
				user: "u-quiet",
				role: "manager",
				status: "active",
				inboxNotifications: "none",
			},
		],
		conversations: [
			{
				id: "c-1",
				participants: ["u-buyer", "u-owner"],
				shop: "s-1",
				buyer: "u-buyer",
				assignee: over.assignee ?? null,
				inboxStatus: "open",
				awaitingReply: true,
			},
		],
	});
}

const req = (payload: ReturnType<typeof seed>) =>
	({ payload, context: {}, user: null }) as never;

beforeEach(() => {
	triggers.length = 0;
});

describe("inboxNotificationRecipients", () => {
	it("notifies every inbox.reply member whose preference is all, minus the sender", async () => {
		const { inboxNotificationRecipients } = await import(
			"../../src/services/shopMemberNotifications"
		);
		const payload = seed();
		const ids = await inboxNotificationRecipients(payload, {
			shopId: "s-1",
			conversationId: "c-1",
			senderId: "u-buyer",
		});
		// `all` holders: owner and manager. `assigned` staff and `none` manager are out.
		expect(ids.sort()).toEqual(["u-mgr", "u-owner"]);
	});

	it("notifies only the assignee when the conversation is assigned", async () => {
		const { inboxNotificationRecipients } = await import(
			"../../src/services/shopMemberNotifications"
		);
		const payload = seed({ assignee: "u-staff" });
		expect(
			await inboxNotificationRecipients(payload, {
				shopId: "s-1",
				conversationId: "c-1",
				senderId: "u-buyer",
			}),
		).toEqual(["u-staff"]);
	});

	it("notifies nobody when the assignee's preference is none", async () => {
		const { inboxNotificationRecipients } = await import(
			"../../src/services/shopMemberNotifications"
		);
		const payload = seed({ assignee: "u-quiet" });
		expect(
			await inboxNotificationRecipients(payload, {
				shopId: "s-1",
				conversationId: "c-1",
				senderId: "u-buyer",
			}),
		).toEqual([]);
	});

	it("never notifies the sender, even when they hold all", async () => {
		const { inboxNotificationRecipients } = await import(
			"../../src/services/shopMemberNotifications"
		);
		const payload = seed();
		expect(
			await inboxNotificationRecipients(payload, {
				shopId: "s-1",
				conversationId: "c-1",
				senderId: "u-owner",
			}),
		).toEqual(["u-mgr"]);
	});

	it("skips a suspended member", async () => {
		const { inboxNotificationRecipients } = await import(
			"../../src/services/shopMemberNotifications"
		);
		const payload = seed();
		payload.store.users[1].suspendedAt = "2026-09-01T00:00:00.000Z";
		payload.store.users[1].suspendedUntil = null;
		expect(
			await inboxNotificationRecipients(payload, {
				shopId: "s-1",
				conversationId: "c-1",
				senderId: "u-buyer",
			}),
		).toEqual(["u-owner"]);
	});

	it("skips a suspended owner too, even though the owner role itself survives suspension", async () => {
		// `resolveShopRole` deliberately exempts the owner from its own
		// suspension check (P1's banner needs the role to stay resolvable), so
		// this is the one case where only this function's own `isSuspended`
		// check keeps a suspended owner out of the recipients.
		const { inboxNotificationRecipients } = await import(
			"../../src/services/shopMemberNotifications"
		);
		const payload = seed();
		payload.store.users[0].suspendedAt = "2026-09-01T00:00:00.000Z";
		payload.store.users[0].suspendedUntil = null;
		expect(
			await inboxNotificationRecipients(payload, {
				shopId: "s-1",
				conversationId: "c-1",
				senderId: "u-buyer",
			}),
		).toEqual(["u-mgr"]);
	});

	it("notifies nobody for a suspended shop", async () => {
		const { inboxNotificationRecipients } = await import(
			"../../src/services/shopMemberNotifications"
		);
		const payload = seed();
		payload.store.shops[0].status = "suspended";
		expect(
			await inboxNotificationRecipients(payload, {
				shopId: "s-1",
				conversationId: "c-1",
				senderId: "u-buyer",
			}),
		).toEqual([]);
	});
});

describe("notifyShopInboxMessage", () => {
	it("throttles to one push per conversation per recipient per two minutes", async () => {
		const mod = await import("../../src/services/shopMemberNotifications");
		expect(mod.INBOX_PUSH_THROTTLE).toEqual([
			{ name: "notif:inbox", limit: 1, windowSeconds: 120 },
		]);

		const payload = seed();
		let clock = NOW;
		const store = new MemoryCounterStore(() => clock);
		const input = {
			conversationId: "c-1",
			shopId: "s-1",
			senderId: "u-buyer",
			preview: "bonjour",
		};

		await mod.notifyShopInboxMessage(req(payload), input, {
			store,
			now: () => clock,
		});
		expect(triggers.map((t) => t.subscriberId).sort()).toEqual([
			"u-mgr",
			"u-owner",
		]);

		triggers.length = 0;
		clock += 60_000;
		await mod.notifyShopInboxMessage(req(payload), input, {
			store,
			now: () => clock,
		});
		expect(triggers).toHaveLength(0);

		clock += 61_000;
		await mod.notifyShopInboxMessage(req(payload), input, {
			store,
			now: () => clock,
		});
		expect(triggers.map((t) => t.subscriberId).sort()).toEqual([
			"u-mgr",
			"u-owner",
		]);
	});

	it("throttles per conversation, not per shop", async () => {
		const mod = await import("../../src/services/shopMemberNotifications");
		const payload = seed();
		payload.store.conversations.push({
			id: "c-2",
			participants: ["u-buyer", "u-owner"],
			shop: "s-1",
			buyer: "u-buyer",
			assignee: null,
			inboxStatus: "open",
			awaitingReply: true,
		});
		const store = new MemoryCounterStore(() => NOW);
		const deps = { store, now: () => NOW };
		await mod.notifyShopInboxMessage(
			req(payload),
			{
				conversationId: "c-1",
				shopId: "s-1",
				senderId: "u-buyer",
				preview: "a",
			},
			deps,
		);
		triggers.length = 0;
		await mod.notifyShopInboxMessage(
			req(payload),
			{
				conversationId: "c-2",
				shopId: "s-1",
				senderId: "u-buyer",
				preview: "b",
			},
			deps,
		);
		expect(triggers).toHaveLength(2);
	});

	it("carries the shop name and the conversation id so the push can deep-link", async () => {
		const mod = await import("../../src/services/shopMemberNotifications");
		const payload = seed();
		await mod.notifyShopInboxMessage(
			req(payload),
			{
				conversationId: "c-1",
				shopId: "s-1",
				senderId: "u-buyer",
				preview: "bonjour",
			},
			{ store: new MemoryCounterStore(() => NOW), now: () => NOW },
		);
		expect(triggers[0]).toMatchObject({
			event: "shop-inbox-message",
			payload: {
				shopId: "s-1",
				shopName: "Akwa",
				conversationId: "c-1",
				buyerName: "Eve",
				messagePreview: "bonjour",
			},
		});
	});
});

describe("the team workflows", () => {
	it("reaches an email invitee through an inline subscriber", async () => {
		const { notifyShopInvitation } = await import(
			"../../src/services/shopMemberNotifications"
		);
		await notifyShopInvitation({
			invitationId: "inv-1",
			shopId: "s-1",
			shopName: "Akwa",
			inviterName: "Aicha",
			role: "staff",
			channel: "email",
			target: "bruno@example.com",
			token: "tok",
			existingUserId: null,
		});
		expect(triggers).toEqual([
			{
				event: "shop-invitation",
				subscriberId: "invite-inv-1",
				email: "bruno@example.com",
				payload: {
					shopId: "s-1",
					shopName: "Akwa",
					inviterName: "Aicha",
					role: "staff",
					inviteUrl: "https://buynsellem.com/invite/tok",
				},
			},
		]);
	});

	it("also reaches an existing account in-app and by push", async () => {
		const { notifyShopInvitation } = await import(
			"../../src/services/shopMemberNotifications"
		);
		await notifyShopInvitation({
			invitationId: "inv-1",
			shopId: "s-1",
			shopName: "Akwa",
			inviterName: "Aicha",
			role: "manager",
			channel: "phone",
			target: "+237612345421",
			token: "tok",
			existingUserId: "u-mgr",
		});
		expect(triggers.map((t) => t.subscriberId)).toEqual(["u-mgr"]);
	});

	it("sends nothing at all for a phone invitation to a stranger: the SMS is the message", async () => {
		const { notifyShopInvitation } = await import(
			"../../src/services/shopMemberNotifications"
		);
		await notifyShopInvitation({
			invitationId: "inv-1",
			shopId: "s-1",
			shopName: "Akwa",
			inviterName: "Aicha",
			role: "staff",
			channel: "phone",
			target: "+237699999999",
			token: "tok",
			existingUserId: null,
		});
		expect(triggers).toHaveLength(0);
	});

	it("notifies the inviter and the owner once each on acceptance, de-duplicated", async () => {
		const { notifyInvitationAccepted } = await import(
			"../../src/services/shopMemberNotifications"
		);
		await notifyInvitationAccepted({
			shopId: "s-1",
			shopName: "Akwa",
			memberName: "Bruno",
			role: "manager",
			recipientIds: ["u-owner", "u-owner"],
		});
		expect(triggers.map((t) => [t.event, t.subscriberId])).toEqual([
			["shop-invitation-accepted", "u-owner"],
		]);
	});

	it("fires the remaining five workflows with their ids", async () => {
		const mod = await import("../../src/services/shopMemberNotifications");
		await mod.notifyInvitationDeclined({
			shopId: "s-1",
			shopName: "Akwa",
			maskedTarget: "b•••@example.com",
			inviterId: "u-owner",
		});
		await mod.notifyMemberRemoved({
			shopId: "s-1",
			shopName: "Akwa",
			userId: "u-staff",
		});
		await mod.notifyMemberRoleChanged({
			shopId: "s-1",
			shopName: "Akwa",
			userId: "u-staff",
			role: "manager",
		});
		await mod.notifyShopTeamPaused({
			shopId: "s-1",
			shopName: "Akwa",
			ownerId: "u-owner",
			memberIds: ["u-mgr", "u-staff"],
		});
		await mod.notifyConversationAssigned({
			shopId: "s-1",
			shopName: "Akwa",
			conversationId: "c-1",
			assigneeId: "u-staff",
			assignedByName: "Aicha",
		});
		expect(triggers.map((t) => t.event)).toEqual([
			"shop-invitation-declined",
			"shop-member-removed",
			"shop-member-role-changed",
			"shop-team-paused",
			"shop-team-paused",
			"shop-team-paused",
			"shop-conversation-assigned",
		]);
	});
});

describe("payload hygiene", () => {
	it("sends shop-inbox-message with exactly its five keys, whatever the preview holds", async () => {
		const mod = await import("../../src/services/shopMemberNotifications");
		const payload = seed();
		// Stands in for a long raw message body: the service must forward
		// whatever preview it is handed and never widen the payload to carry
		// anything else about the message.
		const longBody = "x".repeat(500);
		await mod.notifyShopInboxMessage(
			req(payload),
			{
				conversationId: "c-1",
				shopId: "s-1",
				senderId: "u-buyer",
				preview: longBody,
			},
			{ store: new MemoryCounterStore(() => NOW), now: () => NOW },
		);
		const [call] = triggers;
		expect(Object.keys(call.payload).sort()).toEqual(
			[
				"shopId",
				"shopName",
				"conversationId",
				"buyerName",
				"messagePreview",
			].sort(),
		);
		expect(call.payload.messagePreview).toBe(longBody);
	});

	it("pins the exact payload key set of every other team workflow", async () => {
		const mod = await import("../../src/services/shopMemberNotifications");
		await mod.notifyShopInvitation({
			invitationId: "inv-1",
			shopId: "s-1",
			shopName: "Akwa",
			inviterName: "Aicha",
			role: "staff",
			channel: "email",
			target: "bruno@example.com",
			token: "tok",
			existingUserId: null,
		});
		await mod.notifyInvitationAccepted({
			shopId: "s-1",
			shopName: "Akwa",
			memberName: "Bruno",
			role: "manager",
			recipientIds: ["u-owner"],
		});
		await mod.notifyInvitationDeclined({
			shopId: "s-1",
			shopName: "Akwa",
			maskedTarget: "b•••@example.com",
			inviterId: "u-owner",
		});
		await mod.notifyMemberRemoved({
			shopId: "s-1",
			shopName: "Akwa",
			userId: "u-staff",
		});
		await mod.notifyMemberRoleChanged({
			shopId: "s-1",
			shopName: "Akwa",
			userId: "u-staff",
			role: "manager",
		});
		await mod.notifyShopTeamPaused({
			shopId: "s-1",
			shopName: "Akwa",
			ownerId: "u-owner",
			memberIds: [],
		});
		await mod.notifyConversationAssigned({
			shopId: "s-1",
			shopName: "Akwa",
			conversationId: "c-1",
			assigneeId: "u-staff",
			assignedByName: "Aicha",
		});

		const expectedKeys: Record<string, string[]> = {
			"shop-invitation": [
				"shopId",
				"shopName",
				"inviterName",
				"role",
				"inviteUrl",
			],
			"shop-invitation-accepted": ["shopId", "shopName", "memberName", "role"],
			"shop-invitation-declined": ["shopId", "shopName", "maskedTarget"],
			"shop-member-removed": ["shopId", "shopName"],
			"shop-member-role-changed": ["shopId", "shopName", "role"],
			"shop-team-paused": ["shopId", "shopName"],
			"shop-conversation-assigned": [
				"shopId",
				"shopName",
				"conversationId",
				"assignedByName",
			],
		};
		expect(triggers).toHaveLength(Object.keys(expectedKeys).length);
		for (const call of triggers) {
			expect(Object.keys(call.payload).sort()).toEqual(
				[...expectedKeys[call.event]].sort(),
			);
		}
	});

	it("never carries a member's phone or email, whatever workflow fires", async () => {
		const mod = await import("../../src/services/shopMemberNotifications");
		await mod.notifyMemberRemoved({
			shopId: "s-1",
			shopName: "Akwa",
			userId: "u-staff",
		});
		await mod.notifyMemberRoleChanged({
			shopId: "s-1",
			shopName: "Akwa",
			userId: "u-staff",
			role: "manager",
		});
		await mod.notifyShopTeamPaused({
			shopId: "s-1",
			shopName: "Akwa",
			ownerId: "u-owner",
			memberIds: ["u-mgr", "u-staff"],
		});
		await mod.notifyConversationAssigned({
			shopId: "s-1",
			shopName: "Akwa",
			conversationId: "c-1",
			assigneeId: "u-staff",
			assignedByName: "Aicha",
		});

		const forbidden = [
			"bruno@example.com",
			"clara@example.com",
			"aicha@example.com",
			"+237",
		];
		for (const call of triggers) {
			const body = JSON.stringify(call.payload);
			for (const marker of forbidden) expect(body).not.toContain(marker);
		}
	});
});
