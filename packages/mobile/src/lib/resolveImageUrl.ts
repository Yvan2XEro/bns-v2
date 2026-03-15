const API_ORIGIN = (() => {
	const raw = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
	try {
		return new URL(raw).origin;
	} catch {
		return raw.replace(/\/$/, "");
	}
})();

/**
 * Normalises a Payload-generated media URL so it points to the
 * configured API host instead of whatever PAYLOAD_PUBLIC_SERVER_URL
 * was set to on the server (often http://localhost:3000).
 *
 * Handles:
 *   - relative paths  ("/media/foo.jpg"  → "http://192.168.x.x:3000/media/foo.jpg")
 *   - any foreign origin ("http://localhost:3000/media/foo.jpg" → replaces origin)
 *   - already-correct URLs (returned unchanged)
 *   - null / undefined  (returns null)
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
	if (!url) return null;

	if (url.startsWith("/")) {
		return `${API_ORIGIN}${url}`;
	}

	try {
		const parsed = new URL(url);
		if (parsed.origin !== API_ORIGIN) {
			return `${API_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
		}
	} catch {
		// not a valid absolute URL — treat as relative
		return `${API_ORIGIN}/${url}`;
	}

	return url;
}

/**
 * Extracts and resolves the image URL from a Payload listing image entry.
 * Handles both shapes:
 *   - { url: "..." }                 (direct upload)
 *   - { image: { url: "..." } }      (array-of-upload field)
 */
export function resolveListingImageUrl(entry: unknown): string | null {
	if (!entry || typeof entry !== "object") return null;
	const e = entry as Record<string, any>;
	const raw: string | null | undefined = e.url ?? e.image?.url ?? null;
	return resolveImageUrl(raw);
}
