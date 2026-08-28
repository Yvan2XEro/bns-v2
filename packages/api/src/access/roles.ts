/**
 * Role hierarchy and account-suspension state. Single source of truth for
 * "may this actor act on that target?" and "is this account suspended?",
 * both of which are asked from hooks, routes and scripts.
 */

export type Role = "user" | "moderator" | "admin";

const RANKS: Record<Role, number> = {
	user: 0,
	moderator: 1,
	admin: 2,
};

/** Longest suspension a moderator may hand out on their own. */
export const MAX_MODERATOR_SUSPENSION_DAYS = 30;

/** Durations offered in the clients, in days. */
export const SUSPENSION_DURATION_DAYS = [1, 7, 30] as const;

export interface ActorLike {
	role?: string | null;
}

export interface SuspendableUser {
	suspendedAt?: string | Date | null;
	suspendedUntil?: string | Date | null;
}

export class ModerationRuleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ModerationRuleError";
	}
}

/** An unrecognised role ranks with `user`: unknown never grants power. */
export function roleRank(role: string | null | undefined): number {
	if (role && role in RANKS) return RANKS[role as Role];
	return RANKS.user;
}

export function isModerator(actor: ActorLike | null | undefined): boolean {
	if (!actor) return false;
	return roleRank(actor.role) >= RANKS.moderator;
}

export function isAdmin(actor: ActorLike | null | undefined): boolean {
	if (!actor) return false;
	return roleRank(actor.role) >= RANKS.admin;
}

/**
 * Strictly greater, so equal ranks cannot act on each other: two moderators
 * can never sanction one another, and admin-on-admin stays in the Payload
 * panel.
 */
export function canActOn(
	actor: ActorLike | null | undefined,
	target: ActorLike | null | undefined,
): boolean {
	if (!actor || !target) return false;
	if (!isModerator(actor)) return false;
	return roleRank(actor.role) > roleRank(target.role);
}

export function canSuspendIndefinitely(
	actor: ActorLike | null | undefined,
): boolean {
	return isAdmin(actor);
}

function toDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export interface SuspensionSummary {
	active: boolean;
	/** A suspension was set and its end date has passed. */
	expired: boolean;
	indefinite: boolean;
	since: string | null;
	until: string | null;
}

/**
 * Derived, never stored: expiry is a comparison, so a finished sanction stops
 * applying immediately with no scheduled job in the loop. An unparseable
 * `suspendedUntil` keeps the account suspended — corrupt data must not become
 * a silent bypass.
 */
export function suspensionSummary(
	user: SuspendableUser | null | undefined,
	now: Date = new Date(),
): SuspensionSummary {
	const since = toDate(user?.suspendedAt);
	if (!since) {
		return {
			active: false,
			expired: false,
			indefinite: false,
			since: null,
			until: null,
		};
	}

	const rawUntil = user?.suspendedUntil ?? null;
	const until = toDate(rawUntil);
	const indefinite = rawUntil === null;

	if (indefinite || until === null) {
		return {
			active: true,
			expired: false,
			indefinite,
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
	user: SuspendableUser | null | undefined,
	now: Date = new Date(),
): boolean {
	return suspensionSummary(user, now).active;
}

/**
 * Throws rather than clamping: a moderator who asks for 90 days should be told
 * no, not handed 30 and left believing otherwise.
 */
export function resolveSuspensionUntil(
	actor: ActorLike | null | undefined,
	durationDays: number | null | undefined,
	now: Date = new Date(),
): Date | null {
	if (durationDays === null || durationDays === undefined) {
		if (!canSuspendIndefinitely(actor)) {
			throw new ModerationRuleError(
				"An indefinite suspension requires an administrator.",
			);
		}
		return null;
	}

	if (!Number.isFinite(durationDays) || durationDays <= 0) {
		throw new ModerationRuleError("The suspension duration must be positive.");
	}

	if (
		durationDays > MAX_MODERATOR_SUSPENSION_DAYS &&
		!canSuspendIndefinitely(actor)
	) {
		throw new ModerationRuleError(
			`A moderator cannot suspend an account for more than ${MAX_MODERATOR_SUSPENSION_DAYS} days.`,
		);
	}

	const until = new Date(now.getTime());
	until.setUTCDate(until.getUTCDate() + Math.floor(durationDays));
	return until;
}
