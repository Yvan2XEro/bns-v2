export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;
export const HANDLE_COOLDOWN_DAYS = 30;
export const PREVIOUS_HANDLE_TTL_DAYS = 90;
export const CLOSED_HANDLE_HOLD_DAYS = 90;

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
/**
 * A closed shop's handle is renamed to `x` + its id when released (Mongo
 * ObjectId, or `shops-<n>` from the in-memory test fake).
 */
const RELEASED_PATTERN = /^x(?:[0-9a-f]{24}|shops-\d+)$/;

/**
 * Words that would collide with product vocabulary or with a top-level web
 * route. `/s/{handle}` does not collide with routes today, but a handle is
 * also shown bare ("@akwatech") and a future `/{handle}` alias must stay open.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
	"admin",
	"api",
	"app",
	"auth",
	"buynsellem",
	"bns",
	"boutique",
	"boutiques",
	"contact",
	"help",
	"login",
	"moderation",
	"new",
	"privacy",
	"register",
	"s",
	"search",
	"settings",
	"shop",
	"shops",
	"store",
	"support",
	"terms",
	"verify",
	// Top-level web routes (packages/web/src/app) and the API sub-routes that
	// sit beside /api/public/shops/{handle}.
	"cookies",
	"create",
	"favorites",
	"i18n-demo",
	"listing",
	"messages",
	"profile",
	"robots",
	"safety",
	"seller",
	"sitemap",
	"handle-available",
	"mine",
]);

export type HandleProblem = "invalid" | "reserved";

export type HandleValidation =
	| { ok: true; handle: string }
	| { ok: false; handle: string; reason: HandleProblem };

export function normalizeHandle(raw: unknown): string {
	if (typeof raw !== "string") return "";
	return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function releasedHandleFor(shopId: string): string {
	return `x${String(shopId).toLowerCase()}`.slice(0, HANDLE_MAX_LENGTH);
}

export function validateHandle(raw: unknown): HandleValidation {
	const handle = normalizeHandle(raw);
	if (
		handle.length < HANDLE_MIN_LENGTH ||
		handle.length > HANDLE_MAX_LENGTH ||
		!HANDLE_PATTERN.test(handle) ||
		handle.includes("--")
	) {
		return { ok: false, handle, reason: "invalid" };
	}
	if (RESERVED_HANDLES.has(handle) || RELEASED_PATTERN.test(handle)) {
		return { ok: false, handle, reason: "reserved" };
	}
	return { ok: true, handle };
}

function toDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(date: Date | string, days: number): Date {
	const base = toDate(date) ?? new Date();
	const result = new Date(base.getTime());
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

export function nextHandleChangeAt(
	handleChangedAt: Date | string | null | undefined,
	now: Date = new Date(),
): Date | null {
	const changed = toDate(handleChangedAt);
	if (!changed) return null;
	const next = addDays(changed, HANDLE_COOLDOWN_DAYS);
	return next.getTime() > now.getTime() ? next : null;
}

export function isPreviousHandleActive(
	entry: { until?: string | Date | null },
	now: Date = new Date(),
): boolean {
	const until = toDate(entry.until ?? null);
	return until !== null && until.getTime() > now.getTime();
}

export function pruneExpiredHandles<T extends { until?: string | Date | null }>(
	entries: T[] | null | undefined,
	now: Date = new Date(),
): T[] {
	return (entries ?? []).filter((entry) => isPreviousHandleActive(entry, now));
}

export function closedHandleReleased(
	closedAt: Date | string | null | undefined,
	now: Date = new Date(),
): boolean {
	const closed = toDate(closedAt);
	if (!closed) return false;
	return addDays(closed, CLOSED_HANDLE_HOLD_DAYS).getTime() <= now.getTime();
}
