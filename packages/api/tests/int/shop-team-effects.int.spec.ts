import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setMembershipPublisherForTests } from "../../src/hooks/membershipEvents";
import { closeShopInTransaction } from "../../src/services/shopListings";
import {
	__resetShopLevelListeners,
	notifyShopLevelChanged,
} from "../../src/services/shops";
import {
	handleShopLevelChange,
	registerShopTeamLevelListener,
} from "../../src/services/shopTeamLevel";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const published: string[] = [];

function seed(over: { level?: number; status?: string } = {}) {
	return fakePayload(
		{
			users: [
				{ id: "u-owner", role: "user", name: "Aicha", email: "a@x.com" },
				{ id: "u-mgr", role: "user", name: "Bruno", email: "b@x.com" },
				{ id: "u-staff", role: "user", name: "Clara", email: "c@x.com" },
				{ id: "u-buyer", role: "user", name: "Eve", email: "e@x.com" },
			],
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					name: "Akwa",
					owner: "u-owner",
					status: over.status ?? "active",
					level: over.level ?? 2,
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
			"shop-invitations": [
				{
					id: "inv-1",
					shop: "s-1",
					role: "staff",
					channel: "email",
					email: "z@x.com",
					pendingKey: "s-1:email:z@x.com",
					tokenHash: "h",
					status: "pending",
					invitedBy: "u-owner",
					expiresAt: "2026-10-08T00:00:00.000Z",
					sendCount: 1,
				},
			],
			"shop-activity-log": [],
			conversations: [
				{
					id: "c-1",
					participants: ["u-buyer", "u-owner"],
					shop: "s-1",
					buyer: "u-buyer",
					assignee: "u-staff",
					inboxStatus: "open",
					awaitingReply: true,
				},
			],
			"conversation-reads": [
				{
					id: "r-1",
					conversation: "c-1",
					user: "u-staff",
					lastReadAt: "2026-09-01T00:00:00.000Z",
					lastReadMessage: null,
				},
			],
			listings: [],
			products: [],
			"verification-requests": [],
			messages: [],
		},
		{ uniques: { "shop-members": [["shop", "user"]] } },
	);
}

const req = (payload: ReturnType<typeof seed>) =>
	({ payload, context: {}, user: null }) as never;

beforeEach(() => {
	published.length = 0;
	process.env.REDIS_URL = "redis://localhost:6379";
	__setMembershipPublisherForTests(async (_channel, message) => {
		published.push(message);
	});
	__resetShopLevelListeners();
});

afterEach(() => {
	__setMembershipPublisherForTests(null);
	delete process.env.REDIS_URL;
	__resetShopLevelListeners();
});

describe("closing a shop", () => {
	it("revokes every non-owner membership and every pending invitation, in the close transaction", async () => {
		const payload = seed();
		await closeShopInTransaction(
			req(payload),
			payload.store.shops[0] as never,
			NOW,
		);

		const members = payload.store["shop-members"];
		expect(members.find((m) => m.id === "m-owner")).toMatchObject({
			status: "active",
		});
		expect(members.find((m) => m.id === "m-mgr")).toMatchObject({
			status: "revoked",
			revokedReason: "shop_closed",
		});
		expect(members.find((m) => m.id === "m-staff")).toMatchObject({
			status: "revoked",
			revokedReason: "shop_closed",
		});
		expect(payload.store["shop-invitations"][0]).toMatchObject({
			status: "revoked",
			pendingKey: null,
		});
		expect(
			payload.store["shop-activity-log"].filter(
				(e) => e.action === "member.removed",
			),
		).toHaveLength(2);
		expect(payload.store.conversations[0].assignee).toBeNull();
		expect(payload.store["conversation-reads"]).toHaveLength(0);
	});

	it("publishes one membership change naming both removed users", async () => {
		const payload = seed();
		const { withTransaction } = await import("../../src/lib/transactions");
		await withTransaction(payload, (txReq) =>
			closeShopInTransaction(txReq, payload.store.shops[0] as never, NOW),
		);
		expect(published).toHaveLength(1);
		const message = JSON.parse(published[0]) as { removedUserIds: string[] };
		expect(message.removedUserIds.sort()).toEqual(["u-mgr", "u-staff"]);
	});
});

describe("the level listener", () => {
	it("revokes invitations, pauses members and publishes when teamMembers goes false", async () => {
		const payload = seed({ level: 1 });
		await handleShopLevelChange(req(payload), {
			shopId: "s-1",
			previousLevel: 2,
			level: 1,
			cause: "expired",
		});
		expect(payload.store["shop-invitations"][0].status).toBe("revoked");
		expect(
			payload.store["shop-members"].every((m) => m.status === "active"),
		).toBe(true);
		expect(
			payload.store["shop-activity-log"].filter(
				(e) => e.action === "member.paused",
			),
		).toHaveLength(2);
	});

	it("does nothing when teamMembers was already false", async () => {
		const payload = seed({ level: 1 });
		await handleShopLevelChange(req(payload), {
			shopId: "s-1",
			previousLevel: 0,
			level: 1,
			cause: "manual",
		});
		expect(payload.store["shop-activity-log"]).toHaveLength(0);
		expect(payload.store["shop-invitations"][0].status).toBe("pending");
	});

	it("does nothing when the level rose within the enabled range", async () => {
		const payload = seed({ level: 3 });
		await handleShopLevelChange(req(payload), {
			shopId: "s-1",
			previousLevel: 2,
			level: 3,
			cause: "approved",
		});
		expect(payload.store["shop-activity-log"]).toHaveLength(0);
	});

	it("writes member.resumed when the capability comes back", async () => {
		const payload = seed({ level: 2 });
		await handleShopLevelChange(req(payload), {
			shopId: "s-1",
			previousLevel: 1,
			level: 2,
			cause: "approved",
		});
		expect(
			payload.store["shop-activity-log"].filter(
				(e) => e.action === "member.resumed",
			),
		).toHaveLength(2);
		expect(published).toHaveLength(1);
	});

	it("registers exactly once, however many times it is asked", async () => {
		registerShopTeamLevelListener();
		registerShopTeamLevelListener();
		const payload = seed({ level: 1 });
		await notifyShopLevelChanged(req(payload), {
			shopId: "s-1",
			previousLevel: 2,
			level: 1,
			cause: "expired",
		});
		expect(
			payload.store["shop-activity-log"].filter(
				(e) => e.action === "member.paused",
			),
		).toHaveLength(2);
	});
});

describe("moderation", () => {
	it("publishes a membership change for every shop a suspended user belongs to", async () => {
		const payload = seed();
		payload.store.users.push({ id: "u-mod", role: "moderator", name: "Mod" });
		payload.store.shops.push({
			id: "s-2",
			handle: "bonapriso",
			name: "Bonapriso",
			owner: "u-x",
			status: "active",
			level: 2,
			levelExpiresAt: null,
		});
		payload.store["shop-members"].push({
			id: "m-other",
			shop: "s-2",
			user: "u-staff",
			role: "staff",
			status: "active",
			inboxNotifications: "assigned",
		});

		const { suspendUser } = await import("../../src/services/moderation");
		await suspendUser(payload, { id: "u-mod", role: "moderator" }, "u-staff", {
			reason: "spam",
			durationDays: 7,
		});
		const shopIds = published
			.map((m) => (JSON.parse(m) as { shopId: string }).shopId)
			.sort();
		expect(shopIds).toEqual(["s-1", "s-2"]);
		for (const message of published) {
			expect(JSON.parse(message)).toMatchObject({
				removedUserIds: ["u-staff"],
			});
		}
	});

	it("publishes again on unsuspension so the member's access comes back", async () => {
		const payload = seed();
		payload.store.users.push({ id: "u-mod", role: "moderator", name: "Mod" });
		payload.store.users[2].suspendedAt = "2026-09-01T00:00:00.000Z";
		payload.store.users[2].suspendedUntil = "2026-09-08T00:00:00.000Z";
		const { unsuspendUser } = await import("../../src/services/moderation");
		await unsuspendUser(payload, { id: "u-mod", role: "moderator" }, "u-staff");
		expect(
			published.map((m) => (JSON.parse(m) as { shopId: string }).shopId),
		).toEqual(["s-1"]);
	});

	it("publishes with an empty removedUserIds when a shop is suspended", async () => {
		const payload = seed();
		payload.store.users.push({ id: "u-mod", role: "moderator", name: "Mod" });
		const { suspendShop } = await import("../../src/services/moderation");
		await suspendShop(payload, { id: "u-mod", role: "moderator" }, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		expect(JSON.parse(published[0])).toMatchObject({
			shopId: "s-1",
			removedUserIds: [],
		});
	});
});

describe("account deletion", () => {
	it("revokes a member's memberships and re-attributes their shop messages to the owner", async () => {
		const payload = seed();
		payload.store.messages.push(
			{
				id: "msg-1",
				conversation: "c-1",
				sender: "u-staff",
				content: "on arrive",
				senderSide: "shop",
				read: false,
				formerMemberAuthor: false,
			},
			{
				id: "msg-2",
				conversation: "c-1",
				sender: "u-buyer",
				content: "bonjour",
				senderSide: "buyer",
				read: false,
				formerMemberAuthor: false,
			},
		);
		const { deleteUserRelatedData } = await import(
			"../../src/services/accountDeletion"
		);
		await deleteUserRelatedData(payload as never, { id: "u-staff" } as never);

		expect(
			payload.store["shop-members"].find((m) => m.id === "m-staff"),
		).toMatchObject({
			status: "revoked",
			revokedReason: "account_deleted",
		});
		const kept = payload.store.messages.find((m) => m.id === "msg-1");
		expect(kept).toMatchObject({ sender: "u-owner", formerMemberAuthor: true });
		expect(payload.store.messages.find((m) => m.id === "msg-2")).toBeTruthy();
		// The conversation survives: the deleted member was never a participant.
		expect(payload.store.conversations).toHaveLength(1);
	});

	it("does not re-attribute a classic conversation's messages", async () => {
		const payload = seed();
		payload.store.conversations.push({
			id: "c-solo",
			participants: ["u-staff", "u-buyer"],
			shop: null,
			buyer: null,
		});
		payload.store.messages.push({
			id: "msg-3",
			conversation: "c-solo",
			sender: "u-staff",
			content: "hi",
			read: false,
		});
		const { deleteUserRelatedData } = await import(
			"../../src/services/accountDeletion"
		);
		await deleteUserRelatedData(payload as never, { id: "u-staff" } as never);
		expect(
			payload.store.messages.find((m) => m.id === "msg-3"),
		).toBeUndefined();
	});

	it("closes an owner's shop before the cascade, which revokes the team", async () => {
		const payload = seed();
		const { deleteUserRelatedData } = await import(
			"../../src/services/accountDeletion"
		);
		await deleteUserRelatedData(payload as never, { id: "u-owner" } as never);
		expect(payload.store.shops[0].status).toBe("closed");
		expect(
			payload.store["shop-members"]
				.filter((m) => m.role !== "owner")
				.every((m) => m.status === "revoked"),
		).toBe(true);
	});
});
