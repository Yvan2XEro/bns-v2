/**
 * The resized copies Payload writes next to every `media` upload (see
 * `collections/Media.ts`). `thumbnail` is for cards, rows and avatars,
 * `medium` for a full-width photo on a phone; the original stays for zoom.
 */
export const MEDIA_SIZES = {
	thumbnail: { width: 480, quality: 75 },
	medium: { width: 1280, quality: 80 },
} as const;

export type MediaSize = keyof typeof MEDIA_SIZES;

/** Longest side an original is kept at; larger photos are scaled down. */
export const MEDIA_ORIGINAL_MAX_SIDE = 2048;

/**
 * The dimensions a photo is scaled to before upload (web canvas, mobile
 * image manipulator): its longest side brought down to `maxSide`, aspect
 * ratio kept, never enlarged.
 */
export function fitWithin(
	width: number,
	height: number,
	maxSide: number = MEDIA_ORIGINAL_MAX_SIDE,
): { width: number; height: number } {
	const longest = Math.max(width, height);
	if (longest <= maxSide) return { width, height };
	const scale = maxSide / longest;
	return {
		width: Math.round(width * scale),
		height: Math.round(height * scale),
	};
}

interface MediaUrls {
	url?: unknown;
	thumbnailURL?: unknown;
	sizes?: unknown;
}

const nonEmpty = (value: unknown): string | null =>
	typeof value === "string" && value.length > 0 ? value : null;

function sizeUrl(sizes: unknown, size: MediaSize): string | null {
	if (!sizes || typeof sizes !== "object") return null;
	const entry: unknown = (sizes as Record<string, unknown>)[size];
	if (!entry || typeof entry !== "object") return null;
	return nonEmpty((entry as { url?: unknown }).url);
}

/**
 * The URL of a populated media document at the requested size, falling back
 * to the original when that size was never generated (uploads from before
 * sizes existed, or a photo smaller than the size). `null` for a bare id or
 * a missing document. Without `size`, the original.
 */
export function mediaUrl(value: unknown, size?: MediaSize): string | null {
	if (!value || typeof value !== "object") return null;
	const media = value as MediaUrls;
	const original = nonEmpty(media.url);
	if (!size) return original;
	return (
		sizeUrl(media.sizes, size) ??
		(size === "thumbnail" ? nonEmpty(media.thumbnailURL) : null) ??
		original
	);
}
