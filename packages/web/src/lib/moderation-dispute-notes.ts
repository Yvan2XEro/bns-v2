import type { ModerationDisputeAction } from "~/hooks/use-moderation-disputes";

// Mirrors the route's zod bound; the server stays the authority.
export const MODERATION_NOTE_MIN = 10;

export function noteReady(note: string): boolean {
	return note.trim().length >= MODERATION_NOTE_MIN;
}

export function redactAction(
	messageId: string,
	note: string,
): ModerationDisputeAction {
	return { action: "redact_message", messageId, note: note.trim() };
}

export function revokeAction(
	strikeId: string,
	note: string,
): ModerationDisputeAction {
	return { action: "revoke_strike", strikeId, note: note.trim() };
}
