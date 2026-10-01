import { describe, expect, it, vi } from "vitest";
import {
	changeMemberRole,
	clearShopAssignmentsFor,
	getShopTeam,
	inboxMemberIds,
	leaveShop,
	listMyShops,
	removeMember,
	updateMyMemberPreferences,
} from "../../src/services/shopMembers";
import { fakePayload } from "./helpers/fakePayload";

function seed(over: { level?: number; status?: string } = {}) {
	return fakePayload(
		{
			users: [
				{
					id: "u-owner",
					role: "user",
					name: "Aicha Mbarga",
					email: "aicha@example.com",
				},
				{
					id: "u-mgr",
					role: "user",
					name: "Bruno Ndi",
					email: "bruno@example.com",
				},
				{
					id: "u-staff",
					role: "user",
					name: "Clara Eyenga",
					email: "clara@example.com",
					suspendedAt: null,
				},
				{
					id: "u-buyer",
					role: "user",
					name: "Dede",
					email: "dede@example.com",
				},
			],
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					name: "Akwa",
					owner: "u-owner",
					status: over.status ?? "active",
					level: over.level ?? 3,
					levelExpiresAt: null,
					logo: null,
				},
			],
			"shop-members": [
				{
					id: "m-owner",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
					joinedAt: "2026-01-01T00:00:00.000Z",
					inboxNotifications: "all",
				},
				{
					id: "m-mgr",
					shop: "s-1",
					user: "u-mgr",
					role: "manager",
					status: "active",
					joinedAt: "2026-02-01T00:00:00.000Z",
					inboxNotifications: "all",
				},
				{
					id: "m-staff",
					shop: "s-1",
					user: "u-staff",
					role: "staff",
					status: "active",
					joinedAt: "2026-03-01T00:00:00.000Z",
					inboxNotifications: "assigned",
				},
			],
			"shop-invitations": [],
			"shop-activity-log": [],
			conversations: [
				{
					id: "c-1",
					participants: ["u-buyer", "u-owner"],
					shop: "s-1",
					buyer: "u-buyer",
					assignee: "u-staff",
					assignedAt: "2026-09-01T00:00:00.000Z",
					assignedBy: "u-owner",
					inboxStatus: "open",
					awaitingReply: true,
					lastMessageAt: "2026-09-02T00:00:00.000Z",
				},
				{
					id: "c-2",
					participants: ["u-buyer", "u-owner"],
					shop: "s-1",
					buyer: "u-buyer",
					assignee: null,
					inboxStatus: "open",
					awaitingReply: false,
					lastMessageAt: "2026-09-03T00:00:00.000Z",
				},
			],
			"conversation-reads": [
				{
					id: "r-1",
					conversation: "c-1",
					user: "u-staff",
					lastReadAt: "2026-09-02T00:00:00.000Z",
					lastReadMessage: null,
				},
				{
					id: "r-2",
					conversation: "c-1",
					user: "u-owner",
					lastReadAt: "2026-09-02T00:00:00.000Z",
					lastReadMessage: null,
				},
			],
			messages: [],
		},
		{ uniques: { "shop-members": [["shop", "user"]] } },
	);
}

const actor = (id: string) => ({
	id,
	role: "user",
	name: null,
	suspendedAt: null,
	suspendedUntil: null,
});
const req = (payload: ReturnType<typeof seed>) =>
	({ payload, context: {}, user: null }) as never;

describe("getShopTeam", () => {
	it("gives a staff member the roster with maxMembers and the capability flag", async () => {
		const payload = seed();
		const team = await getShopTeam(payload, actor("u-staff"), "s-1");
		expect(team.activeCount).toBe(3);
		expect(team.maxMembers).toBe(20);
		expect(team.teamMembers).toBe(true);
		expect(team.members.map((m) => [m.role, m.name])).toEqual([
			["owner", "Aicha Mbarga"],
			["manager", "Bruno Ndi"],
			["staff", "Clara Eyenga"],
		]);
	});

	it("flags a suspended member so the owner can reassign", async () => {
		const payload = seed();
		payload.store.users[2].suspendedAt = "2026-09-01T00:00:00.000Z";
		payload.store.users[2].suspendedUntil = null;
		const team = await getShopTeam(payload, actor("u-owner"), "s-1");
		expect(team.members.find((m) => m.userId === "u-staff")?.suspended).toBe(
			true,
		);
	});

	it("shows a staff member only their own inbox preference", async () => {
		const payload = seed();
		const team = await getShopTeam(payload, actor("u-staff"), "s-1");
		expect(
			team.members.find((m) => m.userId === "u-staff")?.inboxNotifications,
		).toBe("assigned");
		expect(
			team.members.find((m) => m.userId === "u-owner")?.inboxNotifications,
		).toBeUndefined();
	});

	it("shows a manager everyone's inbox preference", async () => {
		const payload = seed();
		const team = await getShopTeam(payload, actor("u-mgr"), "s-1");
		expect(team.members.every((m) => m.inboxNotifications !== undefined)).toBe(
			true,
		);
	});

	it("reports maxMembers 5 and an overage after a level-3 shop drops to level 2", async () => {
		const payload = seed({ level: 2 });
		for (let i = 0; i < 4; i++) {
			payload.store["shop-members"].push({
				id: `m-x${i}`,
				shop: "s-1",
				user: `u-x${i}`,
				role: "staff",
				status: "active",
				joinedAt: null,
				inboxNotifications: "assigned",
			});
		}
		const team = await getShopTeam(payload, actor("u-owner"), "s-1");
		expect(team.maxMembers).toBe(5);
		expect(team.activeCount).toBe(7);
	});
});

describe("changeMemberRole", () => {
	it("lets the owner promote a staff member and logs member.role_changed with both values", async () => {
		const payload = seed();
		const view = await changeMemberRole(
			payload,
			actor("u-owner"),
			"s-1",
			"m-staff",
			"manager",
		);
		expect(view.role).toBe("manager");
		expect(payload.store["shop-activity-log"]).toMatchObject([
			{
				action: "member.role_changed",
				targetType: "member",
				targetId: "m-staff",
				metadata: { before: { role: "staff" }, after: { role: "manager" } },
			},
		]);
	});

	it("refuses a manager, who does not hold team.manageManagers", async () => {
		const payload = seed();
		await expect(
			changeMemberRole(payload, actor("u-mgr"), "s-1", "m-staff", "manager"),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
	});

	it("refuses changing the owner's own row", async () => {
		const payload = seed();
		await expect(
			changeMemberRole(payload, actor("u-owner"), "s-1", "m-owner", "manager"),
		).rejects.toMatchObject({ code: "team.cannotManageRole", status: 403 });
	});

	it("refuses promoting anyone to owner", async () => {
		const payload = seed();
		await expect(
			changeMemberRole(payload, actor("u-owner"), "s-1", "m-staff", "owner"),
		).rejects.toMatchObject({ code: "team.cannotManageRole", status: 403 });
	});

	it("keeps a demoted manager's conversation assignments", async () => {
		const payload = seed();
		payload.store.conversations[1].assignee = "u-mgr";
		await changeMemberRole(payload, actor("u-owner"), "s-1", "m-mgr", "staff");
		expect(payload.store.conversations[1].assignee).toBe("u-mgr");
	});

	it("writes no log entry when the role is unchanged", async () => {
		const payload = seed();
		await changeMemberRole(
			payload,
			actor("u-owner"),
			"s-1",
			"m-staff",
			"staff",
		);
		expect(payload.store["shop-activity-log"]).toHaveLength(0);
	});
});

describe("removeMember", () => {
	it("revokes the row, clears the assignments, deletes the reads and logs both actions", async () => {
		const payload = seed();
		await removeMember(payload, actor("u-owner"), "s-1", "m-staff");

		expect(
			payload.store["shop-members"].find((m) => m.id === "m-staff"),
		).toMatchObject({
			status: "revoked",
			revokedBy: "u-owner",
			revokedReason: "removed",
		});
		expect(payload.store.conversations[0].assignee).toBeNull();
		expect(payload.store["conversation-reads"].map((r) => r.id)).toEqual([
			"r-2",
		]);
		expect(
			payload.store["shop-activity-log"].map((e) => e.action).sort(),
		).toEqual(["conversation.assigned", "member.removed"]);
		expect(
			payload.store["shop-activity-log"].find(
				(e) => e.action === "conversation.assigned",
			)?.metadata,
		).toMatchObject({ cause: "member_removed" });
	});

	it("leaves invitations the removed member sent still pending: the shop invited, not the person", async () => {
		const payload = seed();
		payload.store["shop-invitations"].push({
			id: "inv-1",
			shop: "s-1",
			role: "staff",
			channel: "email",
			email: "x@y.com",
			pendingKey: "s-1:email:x@y.com",
			tokenHash: "h",
			status: "pending",
			invitedBy: "u-mgr",
			expiresAt: "2026-10-08T00:00:00.000Z",
			sendCount: 1,
		});
		await removeMember(payload, actor("u-owner"), "s-1", "m-mgr");
		expect(payload.store["shop-invitations"][0].status).toBe("pending");
	});

	it("lets a manager remove a staff member but not another manager", async () => {
		const payload = seed();
		await expect(
			removeMember(payload, actor("u-mgr"), "s-1", "m-staff"),
		).resolves.toEqual({ removed: true });
		const other = seed();
		other.store["shop-members"].push({
			id: "m-mgr2",
			shop: "s-1",
			user: "u-x",
			role: "manager",
			status: "active",
			joinedAt: null,
			inboxNotifications: "all",
		});
		await expect(
			removeMember(other, actor("u-mgr"), "s-1", "m-mgr2"),
		).rejects.toMatchObject({
			code: "shop.forbidden",
			status: 403,
		});
	});

	it("refuses removing the owner", async () => {
		const payload = seed();
		await expect(
			removeMember(payload, actor("u-owner"), "s-1", "m-owner"),
		).rejects.toMatchObject({
			code: "team.cannotManageRole",
			status: 403,
		});
	});

	it("is idempotent: removing an already-revoked row changes nothing and adds no entry", async () => {
		const payload = seed();
		await removeMember(payload, actor("u-owner"), "s-1", "m-staff");
		const entries = payload.store["shop-activity-log"].length;
		await expect(
			removeMember(payload, actor("u-owner"), "s-1", "m-staff"),
		).rejects.toMatchObject({
			code: "generic.notFound",
			status: 404,
		});
		expect(payload.store["shop-activity-log"]).toHaveLength(entries);
	});

	it("publishes the removal with the removed user id, only after commit", async () => {
		const payload = seed();
		process.env.REDIS_URL = "redis://localhost:6379";
		const events = await import("../../src/hooks/membershipEvents");
		const publish = vi.fn(async () => undefined);
		events.__setMembershipPublisherForTests(publish);
		await removeMember(payload, actor("u-owner"), "s-1", "m-staff");
		expect(publish).toHaveBeenCalledWith(
			"chat:membership",
			JSON.stringify({
				type: "shop.members.changed",
				shopId: "s-1",
				removedUserIds: ["u-staff"],
			}),
		);
		events.__setMembershipPublisherForTests(null);
		delete process.env.REDIS_URL;
	});
});

describe("leaveShop", () => {
	it("revokes the caller's own row with reason left and no revokedBy", async () => {
		const payload = seed();
		await leaveShop(payload, actor("u-staff"), "s-1");
		expect(
			payload.store["shop-members"].find((m) => m.id === "m-staff"),
		).toMatchObject({
			status: "revoked",
			revokedReason: "left",
			revokedBy: null,
		});
		expect(payload.store["shop-activity-log"].map((e) => e.action)).toContain(
			"member.left",
		);
	});

	it("refuses the owner", async () => {
		const payload = seed();
		await expect(
			leaveShop(payload, actor("u-owner"), "s-1"),
		).rejects.toMatchObject({
			code: "team.ownerCannotLeave",
			status: 409,
		});
	});

	it("lets a member leave a shop that has gone dormant", async () => {
		const payload = seed({ level: 1 });
		await expect(leaveShop(payload, actor("u-staff"), "s-1")).resolves.toEqual({
			left: true,
		});
	});
});

describe("updateMyMemberPreferences", () => {
	it("lets a staff member change their own preference", async () => {
		const payload = seed();
		const view = await updateMyMemberPreferences(
			payload,
			actor("u-staff"),
			"s-1",
			{
				inboxNotifications: "none",
			},
		);
		expect(view.inboxNotifications).toBe("none");
		expect(
			payload.store["shop-members"].find((m) => m.id === "m-staff")
				?.inboxNotifications,
		).toBe("none");
	});

	it("refuses a value outside the three", async () => {
		const payload = seed();
		await expect(
			updateMyMemberPreferences(payload, actor("u-staff"), "s-1", {
				inboxNotifications: "sometimes",
			}),
		).rejects.toMatchObject({ code: "generic.badRequest", status: 400 });
	});

	it("writes no activity entry: a personal setting is not a team action", async () => {
		const payload = seed();
		await updateMyMemberPreferences(payload, actor("u-staff"), "s-1", {
			inboxNotifications: "none",
		});
		expect(payload.store["shop-activity-log"]).toHaveLength(0);
	});
});

describe("inboxMemberIds", () => {
	it("returns every active member holding inbox.reply", async () => {
		const payload = seed();
		expect((await inboxMemberIds(payload, "s-1")).sort()).toEqual([
			"u-mgr",
			"u-owner",
			"u-staff",
		]);
	});

	it("drops a suspended member", async () => {
		const payload = seed();
		payload.store.users[2].suspendedAt = "2026-09-01T00:00:00.000Z";
		payload.store.users[2].suspendedUntil = null;
		expect((await inboxMemberIds(payload, "s-1")).sort()).toEqual([
			"u-mgr",
			"u-owner",
		]);
	});

	it("returns only the owner for a dormant shop", async () => {
		const payload = seed({ level: 1 });
		expect(await inboxMemberIds(payload, "s-1")).toEqual(["u-owner"]);
	});

	it("returns an empty list for a non-active shop", async () => {
		const payload = seed({ status: "suspended" });
		expect(await inboxMemberIds(payload, "s-1")).toEqual([]);
	});
});

describe("listMyShops", () => {
	it("returns each shop where the caller holds an active role, with its capabilities", async () => {
		const payload = seed();
		const shops = await listMyShops(payload, actor("u-staff"));
		expect(shops).toHaveLength(1);
		expect(shops[0]).toMatchObject({
			shopId: "s-1",
			handle: "akwa",
			role: "staff",
		});
		expect(shops[0].capabilities.maxMembers).toBe(20);
	});

	it("omits a dormant shop for a non-owner and keeps it for the owner", async () => {
		const payload = seed({ level: 1 });
		expect(await listMyShops(payload, actor("u-staff"))).toEqual([]);
		expect(
			(await listMyShops(payload, actor("u-owner"))).map((s) => s.shopId),
		).toEqual(["s-1"]);
	});
});

describe("clearShopAssignmentsFor", () => {
	it("unassigns only that member's conversations in that shop", async () => {
		const payload = seed();
		payload.store.conversations.push({
			id: "c-3",
			participants: ["u-buyer", "u-x"],
			shop: "s-2",
			buyer: "u-buyer",
			assignee: "u-staff",
			inboxStatus: "open",
		});
		const ids = await clearShopAssignmentsFor(
			req(payload),
			"s-1",
			"u-staff",
			"member_removed",
		);
		expect(ids).toEqual(["c-1"]);
		expect(
			payload.store.conversations.find((c) => c.id === "c-3")?.assignee,
		).toBe("u-staff");
	});
});
