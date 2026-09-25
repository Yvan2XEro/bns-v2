/**
 * Client mirror of `packages/api/src/lib/shopHandle.ts`. The server stays
 * authoritative (availability, reservations); this only keeps the creation
 * form from sending a handle the server will refuse on sight.
 *
 * `normalizeHandle` has no server equivalent: the API only trims/lowercases
 * an already-typed handle, while this turns a shop *name* into a slug
 * suggestion (accents stripped, spaces to hyphens). `validateHandle` mirrors
 * the API's rule set exactly — same length bounds, same character pattern,
 * same reserved words, same released-handle pattern — so a locally "valid"
 * handle is never one the server would reject.
 */

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
/** Mirrors `RELEASED_PATTERN` in the API: a closed shop's released handle. */
const RELEASED_HANDLE_PATTERN = /^x(?:[0-9a-f]{24}|shops-\d+)$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 30;

/** Copied verbatim from `packages/api/src/lib/shopHandle.ts` — keep in sync. */
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

export function normalizeHandle(raw: string): string {
	return raw
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.trim()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-{2,}/g, "-")
		.replace(/^-+/, "")
		.slice(0, MAX_LENGTH)
		.replace(/-+$/, "");
}

export function validateHandle(
	handle: string,
): { ok: true } | { ok: false; reason: "invalid" | "reserved" } {
	if (
		handle.length < MIN_LENGTH ||
		handle.length > MAX_LENGTH ||
		!HANDLE_PATTERN.test(handle) ||
		handle.includes("--")
	) {
		return { ok: false, reason: "invalid" };
	}
	if (RESERVED_HANDLES.has(handle) || RELEASED_HANDLE_PATTERN.test(handle)) {
		return { ok: false, reason: "reserved" };
	}
	return { ok: true };
}

export function shopUrl(handle: string, webUrl?: string | null): string {
	const base = (webUrl || "https://buynsellem.com").replace(/\/+$/, "");
	return `${base}/s/${handle}`;
}

/** What the shop page shows under the name: "buynsellem.com/s/akwatech". */
export function shopUrlLabel(handle: string, webUrl?: string | null): string {
	return shopUrl(handle, webUrl).replace(/^https?:\/\//, "");
}
