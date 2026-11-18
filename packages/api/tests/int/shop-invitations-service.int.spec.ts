import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashInvitationToken } from "../../src/lib/invitationTokens";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import {
	acceptInvitation,
	declineInvitation,
	INVITES_PER_SHOP_PER_DAY,
	inviteMember,
	lookupInvitation,
	resendInvitation,
	revokeInvitation,
} from "../../src/services/shopMembers";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-01T10:00:00.000Z");

type SeedOptions = {
	level?: number;
	status?: string;
	members?: Record<string, unknown>[];
	invitations?: Record<string, unknown>[];
	users?: Record<string, unknown>[];
};

function seed(options: SeedOptions = {}) {
	return fakePayload(
		{
			users: options.users ?? [
				{
					id: "u-owner",
					role: "user",
					name: "Aicha Mbarga",
					email: "aicha@example.com",
					phone: "+237600000001",
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
				},
				{
					id: "u-invitee",
					role: "user",
					name: "Bruno Ndi",
					email: "bruno@example.com",
					phone: "+237612345421",
					phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
				},
				{
					id: "u-nophone",
					role: "user",
					name: "Clara",
					email: "clara@example.com",
					phone: "+237612345421",
					phoneVerifiedAt: null,
				},
			],
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					name: "Akwa",
					owner: "u-owner",
					status: options.status ?? "active",
					level: options.level ?? 2,
					levelExpiresAt: null,
					logo: null,
				},
			],
			"shop-members": options.members ?? [
				{
					id: "m-owner",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
					joinedAt: "2026-01-01T00:00:00.000Z",
					inboxNotifications: "all",
				},
			],
			"shop-invitations": options.invitations ?? [],
			"shop-activity-log": [],
			conversations: [],
			"conversation-reads": [],
		},
		{
			uniques: {
				"shop-invitations": [["pendingKey"]],
				"shop-members": [["shop", "user"]],
			},
		},
	);
}

const actor = (id: string) => ({
	id,
	role: "user",
	name: null,
	suspendedAt: null,
	suspendedUntil: null,
});
const deps = () => ({
	store: new MemoryCounterStore(() => NOW.getTime()),
	now: NOW,
});

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("inviteMember", () => {
	it("creates a pending invitation, stores only the hash, and logs member.invited", async () => {
		const payload = seed();
		const result = await inviteMember(
			payload,
			actor("u-owner"),
			"s-1",
			{ channel: "phone", phone: "+237 612 34 54 21", role: "staff" },
			deps(),
		);

		const row = payload.store["shop-invitations"][0];
		expect(row).toMatchObject({
			shop: "s-1",
			role: "staff",
			channel: "phone",
			phone: "+237612345421",
			status: "pending",
			invitedBy: "u-owner",
			sendCount: 1,
			pendingKey: "s-1:phone:+237612345421",
			expiresAt: "2026-10-08T10:00:00.000Z",
		});
		expect(row.tokenHash).toHaveLength(64);
		expect(JSON.stringify(row)).not.toContain('token":');
		expect(result.invitation.maskedTarget).toBe("+237 6•• •• •4 21");
		expect(payload.store["shop-activity-log"]).toMatchObject([
			{
				shop: "s-1",
				actor: "u-owner",
				actorRole: "owner",
				action: "member.invited",
				targetType: "invitation",
			},
		]);
	});

	it("refuses a manager inviting a manager, and allows them to invite staff", async () => {
		const payload = seed({
			members: [
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
					user: "u-invitee",
					role: "manager",
					status: "active",
					inboxNotifications: "all",
				},
			],
		});
		await expect(
			inviteMember(
				payload,
				actor("u-invitee"),
				"s-1",
				{ channel: "email", email: "x@y.com", role: "manager" },
				deps(),
			),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
		await expect(
			inviteMember(
				payload,
				actor("u-invitee"),
				"s-1",
				{ channel: "email", email: "x@y.com", role: "staff" },
				deps(),
			),
		).resolves.toBeTruthy();
	});

	it("refuses a staff member entirely", async () => {
		const payload = seed({
			members: [
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
					user: "u-invitee",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
			],
		});
		await expect(
			inviteMember(
				payload,
				actor("u-invitee"),
				"s-1",
				{ channel: "email", email: "x@y.com", role: "staff" },
				deps(),
			),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
	});

	it("refuses below level 2 with team.levelRequired", async () => {
		const payload = seed({ level: 1 });
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "x@y.com", role: "staff" },
				deps(),
			),
		).rejects.toMatchObject({ code: "team.levelRequired", status: 403 });
	});

	it("refuses on a suspended shop with shop.inactive", async () => {
		const payload = seed({ status: "suspended" });
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "x@y.com", role: "staff" },
				deps(),
			),
		).rejects.toMatchObject({ code: "shop.inactive", status: 409 });
	});

	it("counts the owner and the pending invitations against maxMembers of 5", async () => {
		const payload = seed({
			members: [
				{
					id: "m-owner",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
					inboxNotifications: "all",
				},
				{
					id: "m-2",
					shop: "s-1",
					user: "u-a",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
				{
					id: "m-3",
					shop: "s-1",
					user: "u-b",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
				// A revoked row does not count.
				{
					id: "m-4",
					shop: "s-1",
					user: "u-c",
					role: "staff",
					status: "revoked",
					inboxNotifications: "assigned",
				},
			],
			invitations: [
				{
					id: "inv-1",
					shop: "s-1",
					role: "staff",
					channel: "email",
					email: "p1@y.com",
					pendingKey: "s-1:email:p1@y.com",
					tokenHash: "h1",
					status: "pending",
					invitedBy: "u-owner",
					expiresAt: "2026-10-08T00:00:00.000Z",
					sendCount: 1,
				},
				// An expired pending invitation does not count.
				{
					id: "inv-2",
					shop: "s-1",
					role: "staff",
					channel: "email",
					email: "p2@y.com",
					pendingKey: "s-1:email:p2@y.com",
					tokenHash: "h2",
					status: "pending",
					invitedBy: "u-owner",
					expiresAt: "2026-09-01T00:00:00.000Z",
					sendCount: 1,
				},
			],
		});
		// 3 active + 1 live pending = 4, below 5: the fifth seat is available.
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "p3@y.com", role: "staff" },
				deps(),
			),
		).resolves.toBeTruthy();
		// Now 3 + 2 = 5: full.
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "p4@y.com", role: "staff" },
				deps(),
			),
		).rejects.toMatchObject({ code: "team.limitReached", status: 409 });
	});

	it("refuses inviting the caller's own phone or email", async () => {
		const payload = seed();
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "phone", phone: "+237600000001", role: "staff" },
				deps(),
			),
		).rejects.toMatchObject({ code: "team.cannotInviteSelf", status: 400 });
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "AICHA@example.com", role: "staff" },
				deps(),
			),
		).rejects.toMatchObject({ code: "team.cannotInviteSelf", status: 400 });
	});

	it("refuses inviting someone who is already an active member", async () => {
		const payload = seed({
			members: [
				{
					id: "m-owner",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
					inboxNotifications: "all",
				},
				{
					id: "m-2",
					shop: "s-1",
					user: "u-invitee",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
			],
		});
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "bruno@example.com", role: "staff" },
				deps(),
			),
		).rejects.toMatchObject({ code: "team.alreadyMember", status: 409 });
	});

	it("refuses a second pending invitation to the same target", async () => {
		const payload = seed();
		await inviteMember(
			payload,
			actor("u-owner"),
			"s-1",
			{ channel: "email", email: "bruno@example.com", role: "staff" },
			deps(),
		);
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "Bruno@Example.com", role: "manager" },
				deps(),
			),
		).rejects.toMatchObject({ code: "team.invitationPending", status: 409 });
	});

	it("maps the unique-index collision of two racing invites to team.invitationPending", async () => {
		const payload = seed();
		// The pre-insert check passes for both; the index decides.
		payload.store["shop-invitations"].push({
			id: "inv-race",
			shop: "s-1",
			role: "staff",
			channel: "email",
			email: "bruno@example.com",
			pendingKey: "s-1:email:bruno@example.com",
			tokenHash: "h-race",
			status: "pending",
			invitedBy: "u-owner",
			expiresAt: "2026-10-08T00:00:00.000Z",
			sendCount: 1,
		});
		const original = payload.find.bind(payload);
		let first = true;
		payload.find = (async (args: { collection: string }) => {
			if (args.collection === "shop-invitations" && first) {
				first = false;
				return {
					docs: [],
					totalDocs: 0,
					page: 1,
					totalPages: 1,
					hasNextPage: false,
					nextPage: null,
				};
			}
			return original(args as never);
		}) as typeof payload.find;
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "bruno@example.com", role: "staff" },
				deps(),
			),
		).rejects.toMatchObject({ code: "team.invitationPending", status: 409 });
	});

	it("stops at 20 invitations per shop per day", async () => {
		const payload = seed();
		const shared = deps();
		expect(INVITES_PER_SHOP_PER_DAY).toBe(20);
		for (let i = 0; i < 20; i++) {
			await inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: `x${i}@y.com`, role: "staff" },
				shared,
			);
			payload.store["shop-invitations"][i].status = "revoked";
			payload.store["shop-invitations"][i].pendingKey = null;
		}
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "x21@y.com", role: "staff" },
				shared,
			),
		).rejects.toMatchObject({ code: "generic.rateLimited", status: 429 });
	});

	it("keeps the invitation and reports delivered: false when the SMS fails", async () => {
		const payload = seed();
		vi.spyOn(
			await import("../../src/services/smsProvider"),
			"sendSms",
		).mockRejectedValue(new Error("provider down"));
		const result = await inviteMember(
			payload,
			actor("u-owner"),
			"s-1",
			{ channel: "phone", phone: "+237612345421", role: "staff" },
			deps(),
		);
		expect(result.delivered).toBe(false);
		expect(payload.store["shop-invitations"][0].status).toBe("pending");
	});
});

describe("resendInvitation", () => {
	const pending = (over: Record<string, unknown> = {}) => ({
		id: "inv-1",
		shop: "s-1",
		role: "staff",
		channel: "phone",
		phone: "+237612345421",
		pendingKey: "s-1:phone:+237612345421",
		tokenHash: hashInvitationToken("old-token"),
		status: "pending",
		invitedBy: "u-owner",
		expiresAt: "2026-10-08T00:00:00.000Z",
		sendCount: 1,
		lastSentAt: "2026-10-01T08:00:00.000Z",
		...over,
	});

	it("replaces the token so the old link stops working, and bumps sendCount", async () => {
		const payload = seed({ invitations: [pending()] });
		await resendInvitation(payload, actor("u-owner"), "s-1", "inv-1", deps());

		const row = payload.store["shop-invitations"][0];
		expect(row.sendCount).toBe(2);
		expect(row.tokenHash).not.toBe(hashInvitationToken("old-token"));
		expect(row.lastSentAt).toBe(NOW.toISOString());
		expect(payload.store["shop-invitations"]).toHaveLength(1);
		expect(payload.store["shop-activity-log"].map((e) => e.action)).toEqual([
			"member.invitation_resent",
		]);

		// Review Focus 3: the link still sitting in the invitee's SMS inbox.
		await expect(
			lookupInvitation(payload, "old-token", NOW),
		).rejects.toMatchObject({
			code: "team.invitationInvalid",
			status: 404,
		});
		await expect(
			acceptInvitation(payload, actor("u-invitee"), "old-token", NOW),
		).rejects.toMatchObject({
			code: "team.invitationInvalid",
			status: 409,
		});
		expect(
			payload.store["shop-members"].filter((m) => m.user === "u-invitee"),
		).toHaveLength(0);
	});

	it("refuses a resend inside the hour", async () => {
		const payload = seed({
			invitations: [pending({ lastSentAt: "2026-10-01T09:30:00.000Z" })],
		});
		await expect(
			resendInvitation(payload, actor("u-owner"), "s-1", "inv-1", deps()),
		).rejects.toMatchObject({ code: "team.resendLimit", status: 429 });
	});

	it("refuses a fourth send", async () => {
		const payload = seed({ invitations: [pending({ sendCount: 3 })] });
		await expect(
			resendInvitation(payload, actor("u-owner"), "s-1", "inv-1", deps()),
		).rejects.toMatchObject({ code: "team.resendLimit", status: 429 });
	});

	it("refuses a resend on an invitation that is not pending", async () => {
		const payload = seed({ invitations: [pending({ status: "revoked" })] });
		await expect(
			resendInvitation(payload, actor("u-owner"), "s-1", "inv-1", deps()),
		).rejects.toMatchObject({ code: "team.invitationInvalid", status: 409 });
	});

	it("refuses a resend for an invitation belonging to another shop", async () => {
		const payload = seed({ invitations: [pending({ shop: "s-2" })] });
		await expect(
			resendInvitation(payload, actor("u-owner"), "s-1", "inv-1", deps()),
		).rejects.toMatchObject({ code: "team.invitationInvalid", status: 409 });
	});
});

describe("revokeInvitation", () => {
	it("moves a pending invitation to revoked, clears pendingKey and logs it", async () => {
		const payload = seed({
			invitations: [
				{
					id: "inv-1",
					shop: "s-1",
					role: "staff",
					channel: "email",
					email: "bruno@example.com",
					pendingKey: "s-1:email:bruno@example.com",
					tokenHash: hashInvitationToken("t"),
					status: "pending",
					invitedBy: "u-owner",
					expiresAt: "2026-10-08T00:00:00.000Z",
					sendCount: 1,
				},
			],
		});
		await revokeInvitation(payload, actor("u-owner"), "s-1", "inv-1");
		expect(payload.store["shop-invitations"][0]).toMatchObject({
			status: "revoked",
			pendingKey: null,
		});
		expect(payload.store["shop-activity-log"].map((e) => e.action)).toEqual([
			"member.invitation_revoked",
		]);
		// The freed target can be invited again.
		await expect(
			inviteMember(
				payload,
				actor("u-owner"),
				"s-1",
				{ channel: "email", email: "bruno@example.com", role: "staff" },
				deps(),
			),
		).resolves.toBeTruthy();
	});
});

describe("lookupInvitation", () => {
	const pending = (over: Record<string, unknown> = {}) => ({
		id: "inv-1",
		shop: "s-1",
		role: "manager",
		channel: "email",
		email: "bruno@example.com",
		pendingKey: "s-1:email:bruno@example.com",
		tokenHash: hashInvitationToken("good-token"),
		status: "pending",
		invitedBy: "u-owner",
		expiresAt: "2026-10-08T00:00:00.000Z",
		sendCount: 1,
		...over,
	});

	it("returns the shop, the role, the masked target and the inviter's first name", async () => {
		const payload = seed({ invitations: [pending()] });
		const view = await lookupInvitation(payload, "good-token", NOW);
		expect(view).toMatchObject({
			shop: { name: "Akwa", handle: "akwa", badge: "identity" },
			role: "manager",
			channel: "email",
			maskedTarget: "b•••@example.com",
			inviterFirstName: "Aicha",
			expiresAt: "2026-10-08T00:00:00.000Z",
			status: "pending",
		});
	});

	it("reports expired for a pending invitation past its date, without writing anything", async () => {
		const payload = seed({
			invitations: [pending({ expiresAt: "2026-09-30T00:00:00.000Z" })],
		});
		const view = await lookupInvitation(payload, "good-token", NOW);
		expect(view.status).toBe("expired");
		expect(payload.store["shop-invitations"][0].status).toBe("pending");
	});

	it("404s an unknown token", async () => {
		const payload = seed({ invitations: [pending()] });
		await expect(lookupInvitation(payload, "nope", NOW)).rejects.toMatchObject({
			code: "team.invitationInvalid",
			status: 404,
		});
	});

	it("404s a token that is not base64url at all rather than throwing", async () => {
		const payload = seed({ invitations: [pending()] });
		await expect(
			lookupInvitation(payload, "!!! not a token !!!", NOW),
		).rejects.toMatchObject({
			code: "team.invitationInvalid",
			status: 404,
		});
	});
});

describe("acceptInvitation", () => {
	const pendingPhone = (over: Record<string, unknown> = {}) => ({
		id: "inv-1",
		shop: "s-1",
		role: "staff",
		channel: "phone",
		phone: "+237612345421",
		pendingKey: "s-1:phone:+237612345421",
		tokenHash: hashInvitationToken("good-token"),
		status: "pending",
		invitedBy: "u-owner",
		expiresAt: "2026-10-08T00:00:00.000Z",
		sendCount: 1,
		...over,
	});

	it("creates the membership, accepts the invitation and logs member.joined", async () => {
		const payload = seed({ invitations: [pendingPhone()] });
		const result = await acceptInvitation(
			payload,
			actor("u-invitee"),
			"good-token",
			NOW,
		);
		expect(result).toEqual({ shopId: "s-1", role: "staff" });
		expect(
			payload.store["shop-members"].find((m) => m.user === "u-invitee"),
		).toMatchObject({
			shop: "s-1",
			role: "staff",
			status: "active",
			invitation: "inv-1",
			joinedAt: NOW.toISOString(),
			inboxNotifications: "assigned",
		});
		expect(payload.store["shop-invitations"][0]).toMatchObject({
			status: "accepted",
			acceptedBy: "u-invitee",
			respondedAt: NOW.toISOString(),
			pendingKey: null,
		});
		expect(payload.store["shop-activity-log"].map((e) => e.action)).toEqual([
			"member.joined",
		]);
	});

	it("defaults a manager's inbox preference to all and a staff member's to assigned", async () => {
		const payload = seed({ invitations: [pendingPhone({ role: "manager" })] });
		await acceptInvitation(payload, actor("u-invitee"), "good-token", NOW);
		expect(
			payload.store["shop-members"].find((m) => m.user === "u-invitee")
				?.inboxNotifications,
		).toBe("all");
	});

	it("refuses a caller with no verified phone", async () => {
		const payload = seed({ invitations: [pendingPhone()] });
		await expect(
			acceptInvitation(payload, actor("u-nophone"), "good-token", NOW),
		).rejects.toMatchObject({
			code: "team.phoneVerificationRequired",
			status: 403,
		});
	});

	it("refuses a caller whose verified number is a different one", async () => {
		const payload = seed({ invitations: [pendingPhone()] });
		await expect(
			acceptInvitation(payload, actor("u-owner"), "good-token", NOW),
		).rejects.toMatchObject({ code: "team.invitationMismatch", status: 403 });
	});

	it("matches an email invitation case-insensitively and refuses another address", async () => {
		const payload = seed({
			invitations: [
				pendingPhone({
					channel: "email",
					phone: null,
					email: "BRUNO@example.com",
					pendingKey: "s-1:email:bruno@example.com",
				}),
			],
		});
		await expect(
			acceptInvitation(payload, actor("u-invitee"), "good-token", NOW),
		).resolves.toMatchObject({ role: "staff" });

		const other = seed({
			invitations: [
				pendingPhone({
					channel: "email",
					phone: null,
					email: "someone@else.com",
					pendingKey: "s-1:email:someone@else.com",
				}),
			],
		});
		await expect(
			acceptInvitation(other, actor("u-invitee"), "good-token", NOW),
		).rejects.toMatchObject({ code: "team.invitationMismatch", status: 403 });
	});

	it("refuses a suspended caller", async () => {
		const payload = seed({ invitations: [pendingPhone()] });
		payload.store.users[1].suspendedAt = "2026-09-01T00:00:00.000Z";
		payload.store.users[1].suspendedUntil = null;
		await expect(
			acceptInvitation(payload, actor("u-invitee"), "good-token", NOW),
		).rejects.toMatchObject({
			code: "moderation.accountSuspended",
			status: 403,
		});
	});

	it("reactivates a revoked row with the new role and clears the revocation fields", async () => {
		const payload = seed({
			invitations: [pendingPhone({ role: "manager" })],
			members: [
				{
					id: "m-owner",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
					inboxNotifications: "all",
				},
				{
					id: "m-old",
					shop: "s-1",
					user: "u-invitee",
					role: "staff",
					status: "revoked",
					joinedAt: "2026-02-01T00:00:00.000Z",
					revokedAt: "2026-03-01T00:00:00.000Z",
					revokedBy: "u-owner",
					revokedReason: "removed",
					inboxNotifications: "assigned",
				},
			],
		});
		await acceptInvitation(payload, actor("u-invitee"), "good-token", NOW);
		const row = payload.store["shop-members"].find((m) => m.id === "m-old");
		expect(row).toMatchObject({
			role: "manager",
			status: "active",
			joinedAt: NOW.toISOString(),
			revokedAt: null,
			revokedBy: null,
			revokedReason: null,
			invitation: "inv-1",
		});
		expect(
			payload.store["shop-members"].filter((m) => m.user === "u-invitee"),
		).toHaveLength(1);
	});

	it("refuses when the caller is already an active member", async () => {
		const payload = seed({
			invitations: [pendingPhone()],
			members: [
				{
					id: "m-owner",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
					inboxNotifications: "all",
				},
				{
					id: "m-2",
					shop: "s-1",
					user: "u-invitee",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
			],
		});
		await expect(
			acceptInvitation(payload, actor("u-invitee"), "good-token", NOW),
		).rejects.toMatchObject({ code: "team.alreadyMember", status: 409 });
	});

	// Review Focus 2.
	it("re-checks the level, the shop status and the seat count inside the transaction", async () => {
		const dormant = seed({ level: 1, invitations: [pendingPhone()] });
		await expect(
			acceptInvitation(dormant, actor("u-invitee"), "good-token", NOW),
		).rejects.toMatchObject({ code: "team.levelRequired", status: 403 });
		expect(dormant.store["shop-invitations"][0].status).toBe("pending");
		expect(dormant.store["shop-members"]).toHaveLength(1);

		const suspended = seed({
			status: "suspended",
			invitations: [pendingPhone()],
		});
		await expect(
			acceptInvitation(suspended, actor("u-invitee"), "good-token", NOW),
		).rejects.toMatchObject({ code: "shop.inactive", status: 409 });
		expect(suspended.store["shop-invitations"][0].status).toBe("pending");

		const closed = seed({ status: "closed", invitations: [pendingPhone()] });
		await expect(
			acceptInvitation(closed, actor("u-invitee"), "good-token", NOW),
		).rejects.toMatchObject({ code: "shop.inactive", status: 409 });

		const full = seed({
			invitations: [pendingPhone()],
			members: [
				{
					id: "m-owner",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
					inboxNotifications: "all",
				},
				{
					id: "m-2",
					shop: "s-1",
					user: "u-a",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
				{
					id: "m-3",
					shop: "s-1",
					user: "u-b",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
				{
					id: "m-4",
					shop: "s-1",
					user: "u-c",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
				{
					id: "m-5",
					shop: "s-1",
					user: "u-d",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
			],
		});
		await expect(
			acceptInvitation(full, actor("u-invitee"), "good-token", NOW),
		).rejects.toMatchObject({ code: "team.limitReached", status: 409 });
		expect(full.store["shop-invitations"][0].status).toBe("pending");
	});

	it("does not count its own invitation against the limit", async () => {
		const payload = seed({
			invitations: [pendingPhone()],
			members: [
				{
					id: "m-owner",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
					inboxNotifications: "all",
				},
				{
					id: "m-2",
					shop: "s-1",
					user: "u-a",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
				{
					id: "m-3",
					shop: "s-1",
					user: "u-b",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
				{
					id: "m-4",
					shop: "s-1",
					user: "u-c",
					role: "staff",
					status: "active",
					inboxNotifications: "assigned",
				},
			],
		});
		await expect(
			acceptInvitation(payload, actor("u-invitee"), "good-token", NOW),
		).resolves.toBeTruthy();
	});

	it("publishes the membership change only after the transaction commits", async () => {
		const payload = seed({ invitations: [pendingPhone()] });
		process.env.REDIS_URL = "redis://localhost:6379";
		const events = await import("../../src/hooks/membershipEvents");
		const publish = vi.fn(async () => undefined);
		events.__setMembershipPublisherForTests(publish);
		payload.failWhen = (method, args) =>
			method === "update" &&
			(args as { collection?: string }).collection === "shop-invitations";
		await expect(
			acceptInvitation(payload, actor("u-invitee"), "good-token", NOW),
		).rejects.toThrow();
		expect(publish).not.toHaveBeenCalled();
		payload.failWhen = null;
		await acceptInvitation(payload, actor("u-invitee"), "good-token", NOW);
		expect(publish).toHaveBeenCalledTimes(1);
		events.__setMembershipPublisherForTests(null);
		delete process.env.REDIS_URL;
	});
});

describe("declineInvitation", () => {
	it("declines without authentication and keeps the row for the record", async () => {
		const payload = seed({
			invitations: [
				{
					id: "inv-1",
					shop: "s-1",
					role: "staff",
					channel: "email",
					email: "bruno@example.com",
					pendingKey: "s-1:email:bruno@example.com",
					tokenHash: hashInvitationToken("good-token"),
					status: "pending",
					invitedBy: "u-owner",
					expiresAt: "2026-10-08T00:00:00.000Z",
					sendCount: 1,
				},
			],
		});
		await declineInvitation(payload, "good-token", NOW);
		expect(payload.store["shop-invitations"][0]).toMatchObject({
			status: "declined",
			respondedAt: NOW.toISOString(),
			pendingKey: null,
		});
	});

	it("refuses to decline twice", async () => {
		const payload = seed({
			invitations: [
				{
					id: "inv-1",
					shop: "s-1",
					role: "staff",
					channel: "email",
					email: "bruno@example.com",
					pendingKey: null,
					tokenHash: hashInvitationToken("good-token"),
					status: "declined",
					invitedBy: "u-owner",
					expiresAt: "2026-10-08T00:00:00.000Z",
					sendCount: 1,
				},
			],
		});
		await expect(
			declineInvitation(payload, "good-token", NOW),
		).rejects.toMatchObject({
			code: "team.invitationInvalid",
			status: 409,
		});
	});
});
