import type { SuspensionSummary, UserDoc, UserRole } from "@/src/types/api";

const RANKS: Record<UserRole, number> = { user: 0, moderator: 1, admin: 2 };

/** Longest suspension a moderator may hand out. Mirrors the API. */
export const MAX_MODERATOR_SUSPENSION_DAYS = 30;

export const SUSPENSION_REASONS = [
	"spam",
	"inappropriate",
	"fraud",
	"prohibited",
	"harassment",
	"other",
] as const;

/** `null` is an indefinite suspension and is admin-only. */
export const SUSPENSION_DURATIONS: (number | null)[] = [1, 7, 30, null];

export function roleRank(role: string | null | undefined): number {
	if (role && role in RANKS) return RANKS[role as UserRole];
	return RANKS.user;
}

export function isModerator(user: { role?: string } | null | undefined) {
	return roleRank(user?.role) >= RANKS.moderator;
}

export function isAdmin(user: { role?: string } | null | undefined) {
	return roleRank(user?.role) >= RANKS.admin;
}

/**
 * Mirrors the server rule so the UI can hide actions it knows will be
 * refused. The server check is the one that counts — this only avoids
 * offering a button that would fail.
 */
export function canActOn(
	actor: { role?: string; id?: string } | null | undefined,
	target: { role?: string; id?: string } | null | undefined,
): boolean {
	if (!actor || !target) return false;
	if (actor.id && target.id && String(actor.id) === String(target.id)) {
		return false;
	}
	if (!isModerator(actor)) return false;
	return roleRank(actor.role) > roleRank(target.role);
}

export function availableDurations(
	actor: { role?: string } | null | undefined,
): (number | null)[] {
	return SUSPENSION_DURATIONS.filter(
		(days) => days !== null || isAdmin(actor),
	).filter(
		(days) =>
			days === null || days <= MAX_MODERATOR_SUSPENSION_DAYS || isAdmin(actor),
	);
}

/** Same derivation as the API: expiry is a comparison, never a stored flag. */
export function suspensionOf(
	user: Pick<UserDoc, "suspendedAt" | "suspendedUntil"> | null | undefined,
	now: Date = new Date(),
): SuspensionSummary {
	const since = user?.suspendedAt ? new Date(user.suspendedAt) : null;
	if (!since || Number.isNaN(since.getTime())) {
		return {
			active: false,
			expired: false,
			indefinite: false,
			since: null,
			until: null,
		};
	}

	const raw = user?.suspendedUntil ?? null;
	const until = raw ? new Date(raw) : null;

	if (!until || Number.isNaN(until.getTime())) {
		return {
			active: true,
			expired: false,
			indefinite: raw === null,
			since: since.toISOString(),
			until: null,
		};
	}

	const active = until.getTime() > now.getTime();
	return {
		active,
		expired: !active,
		indefinite: false,
		since: since.toISOString(),
		until: until.toISOString(),
	};
}

export function isSuspended(
	user: Pick<UserDoc, "suspendedAt" | "suspendedUntil"> | null | undefined,
): boolean {
	return suspensionOf(user).active;
}
