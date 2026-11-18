import type { PublicInvitationView } from "~/types";

export type InviteStep =
	| "loading"
	| "invalid"
	| "expired"
	| "responded"
	| "signIn"
	| "verifyPhone"
	| "mismatch"
	| "ready"
	| "joined";

export interface InviteViewer {
	email: string | null;
	phone: string | null;
	phoneVerifiedAt: string | null;
}

/**
 * One function decides what the invite page shows, so the page itself has no
 * branching worth a component test. The server is the authority on whether a
 * target matches: this only decides which screen to offer, and `mismatch`
 * appears either because the domain plainly differs or because the server said
 * so on the accept.
 */
export function inviteStep(input: {
	invitation: PublicInvitationView | null;
	error: string | null;
	viewer: InviteViewer | null;
	joined: boolean;
}): InviteStep {
	if (input.joined) return "joined";
	if (input.error === "team.invitationMismatch") return "mismatch";
	if (input.error) return "invalid";
	if (!input.invitation) return "loading";
	if (input.invitation.status === "expired") return "expired";
	if (input.invitation.status !== "pending") return "responded";
	if (!input.viewer) return "signIn";

	if (input.invitation.channel === "phone") {
		// A verified number is the proof; whether it is the *right* number is
		// the server's call, not something a masked target can answer.
		return input.viewer.phoneVerifiedAt ? "ready" : "verifyPhone";
	}

	// Only the domain survives masking, so a domain mismatch is certain and a
	// domain match is not. Offering the action on a match and letting the
	// accept refuse is better than refusing someone who is in fact the invitee.
	const invitedDomain = (
		input.invitation.maskedTarget.split("@")[1] ?? ""
	).toLowerCase();
	const mine = (input.viewer.email ?? "").toLowerCase();
	return invitedDomain !== "" && mine.endsWith(`@${invitedDomain}`)
		? "ready"
		: "mismatch";
}

/** What the sign-in and register copy shows; never a prefillable value. */
export function accountHint(invitation: PublicInvitationView): {
	channel: "phone" | "email";
	maskedTarget: string;
} {
	return { channel: invitation.channel, maskedTarget: invitation.maskedTarget };
}
