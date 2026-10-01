import { z } from "zod";
import type { ShopRole, TeamMemberView, TeamView } from "../types/api";
import { can } from "./shopRoles";

/**
 * Mirrors `E164_PATTERN` in `packages/web/src/lib/phone-input.ts` — the same
 * contract `normalizePhoneNumber` in
 * `packages/api/src/services/phoneVerification.ts` enforces. Mobile has no
 * `PhoneInput` widget of its own yet, so the field below defaults to
 * `+237` and this regex is what tells the seller their own typing is wrong,
 * before the request ever reaches the server.
 */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * The same shape `POST /api/shops/{id}/invitations` validates. The
 * conditional requirement is a `superRefine` rather than a discriminated
 * union so the form can keep both fields mounted while the segmented control
 * switches, without losing what the user already typed.
 *
 * The phone branch checks `E164_PATTERN` rather than only "non-empty": a
 * seller can leave a syntactically incomplete number (still typing), and
 * that must fail here with a named reason rather than reach the server.
 */
export const inviteSchema = z
	.object({
		channel: z.enum(["phone", "email"]),
		phone: z.string().trim().optional(),
		email: z.string().trim().optional(),
		role: z.enum(["manager", "staff"]),
	})
	.superRefine((value, ctx) => {
		if (value.channel === "phone") {
			if (!value.phone) {
				ctx.addIssue({ code: "custom", path: ["phone"], message: "required" });
			} else if (!E164_PATTERN.test(value.phone)) {
				ctx.addIssue({ code: "custom", path: ["phone"], message: "invalid" });
			}
		}
		if (value.channel === "email") {
			if (!value.email) {
				ctx.addIssue({ code: "custom", path: ["email"], message: "required" });
				return;
			}
			if (!z.string().email().safeParse(value.email).success) {
				ctx.addIssue({ code: "custom", path: ["email"], message: "invalid" });
			}
		}
	});

export type InviteFormValues = z.infer<typeof inviteSchema>;

export function assignableRoles(
	role: ShopRole | null | undefined,
): Array<"manager" | "staff"> {
	const roles: Array<"manager" | "staff"> = [];
	if (can(role, "team.manageManagers")) roles.push("manager");
	if (can(role, "team.inviteStaff")) roles.push("staff");
	return roles;
}

/** Ownership transfer is out of scope, so the owner's row offers nothing. */
export function memberActions(
	callerRole: ShopRole | null | undefined,
	member: TeamMemberView,
): { canChangeRole: boolean; canRemove: boolean } {
	if (member.role === "owner") {
		return { canChangeRole: false, canRemove: false };
	}
	return {
		canChangeRole: can(callerRole, "team.manageManagers"),
		canRemove:
			member.role === "manager"
				? can(callerRole, "team.manageManagers")
				: can(callerRole, "team.inviteStaff"),
	};
}

/**
 * A pending invitation holds a seat, which is why the meter reads "5 / 5"
 * before the fifth person has accepted anything. `overage` is non-zero only
 * after a level drop shrinks the cap below the roster; nobody is removed,
 * and new invitations are refused until the count fits.
 */
export function seatSummary(team: TeamView): {
	used: number;
	total: number;
	overage: number;
} {
	const used = team.activeCount + team.invitations.length;
	return {
		used,
		total: team.maxMembers,
		overage: Math.max(0, team.activeCount - team.maxMembers),
	};
}
