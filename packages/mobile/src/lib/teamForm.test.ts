import { describe, expect, test } from "bun:test";
import type { TeamMemberView, TeamView } from "../types/api";
import {
	assignableRoles,
	inviteSchema,
	memberActions,
	seatSummary,
} from "./teamForm";

const member = (over: Partial<TeamMemberView> = {}): TeamMemberView => ({
	id: "m-1",
	userId: "u-1",
	name: "Bruno",
	avatarUrl: null,
	role: "staff",
	joinedAt: "2026-02-01T00:00:00.000Z",
	suspended: false,
	...over,
});

describe("inviteSchema", () => {
	test("accepts a phone invitation and refuses one with no number", () => {
		expect(
			inviteSchema.safeParse({
				channel: "phone",
				phone: "+237612345421",
				role: "staff",
			}).success,
		).toBe(true);
		expect(
			inviteSchema.safeParse({ channel: "phone", role: "staff" }).success,
		).toBe(false);
		expect(
			inviteSchema.safeParse({ channel: "phone", phone: "", role: "staff" })
				.success,
		).toBe(false);
	});

	test("accepts an email invitation and refuses a malformed address", () => {
		expect(
			inviteSchema.safeParse({
				channel: "email",
				email: "a@b.com",
				role: "manager",
			}).success,
		).toBe(true);
		expect(
			inviteSchema.safeParse({ channel: "email", email: "a@", role: "manager" })
				.success,
		).toBe(false);
	});

	test("refuses a role outside manager and staff", () => {
		expect(
			inviteSchema.safeParse({
				channel: "email",
				email: "a@b.com",
				role: "owner",
			}).success,
		).toBe(false);
	});

	test("does not require an email when the channel is phone", () => {
		expect(
			inviteSchema.safeParse({
				channel: "phone",
				phone: "+237612345421",
				email: "",
				role: "staff",
			}).success,
		).toBe(true);
	});

	test("refuses a phone number that is not yet a complete E.164 shape", () => {
		expect(
			inviteSchema.safeParse({
				channel: "phone",
				phone: "612345421",
				role: "staff",
			}).success,
		).toBe(false);
		expect(
			inviteSchema.safeParse({
				channel: "phone",
				phone: "+237612",
				role: "staff",
			}).success,
		).toBe(false);
	});
});

describe("assignableRoles", () => {
	test("an owner may invite either role, a manager only staff, a staff member neither", () => {
		expect(assignableRoles("owner")).toEqual(["manager", "staff"]);
		expect(assignableRoles("manager")).toEqual(["staff"]);
		expect(assignableRoles("staff")).toEqual([]);
		expect(assignableRoles(null)).toEqual([]);
	});
});

describe("memberActions", () => {
	test("an owner may change and remove a staff member or a manager", () => {
		expect(memberActions("owner", member())).toEqual({
			canChangeRole: true,
			canRemove: true,
		});
		expect(memberActions("owner", member({ role: "manager" }))).toEqual({
			canChangeRole: true,
			canRemove: true,
		});
	});

	test("a manager may remove a staff member but never change a role", () => {
		expect(memberActions("manager", member())).toEqual({
			canChangeRole: false,
			canRemove: true,
		});
		expect(memberActions("manager", member({ role: "manager" }))).toEqual({
			canChangeRole: false,
			canRemove: false,
		});
	});

	test("nobody may act on the owner's row", () => {
		expect(memberActions("owner", member({ role: "owner" }))).toEqual({
			canChangeRole: false,
			canRemove: false,
		});
	});

	test("a staff member may act on nobody", () => {
		expect(memberActions("staff", member())).toEqual({
			canChangeRole: false,
			canRemove: false,
		});
	});
});

describe("seatSummary", () => {
	const team = (over: Partial<TeamView>): TeamView => ({
		members: [],
		invitations: [],
		activeCount: 3,
		maxMembers: 5,
		teamMembers: true,
		...over,
	});

	test("counts active members plus live invitations against the cap", () => {
		expect(
			seatSummary(
				team({ invitations: [{ id: "i-1" } as never, { id: "i-2" } as never] }),
			),
		).toEqual({ used: 5, total: 5, overage: 0 });
	});

	test("reports the overage after a level-3 shop drops to level 2", () => {
		expect(seatSummary(team({ activeCount: 7, maxMembers: 5 }))).toEqual({
			used: 7,
			total: 5,
			overage: 2,
		});
	});
});
