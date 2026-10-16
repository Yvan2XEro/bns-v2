import type { FieldIssue } from "./formIssues";

/**
 * How many photos a classified listing or a shop product may carry. The
 * number is an admin setting (`app-settings.media.photosIncluded`, served as
 * `photosIncluded` by GET /api/public/config); `ceiling` is the absolute cap
 * whatever the setting says, and is what `PRODUCT_LIMITS.imagesMax` reads.
 * Photos past the included count are meant to become a paid option later.
 */
export const PHOTO_LIMIT = {
	default: 3,
	min: 1,
	ceiling: 10,
} as const;

export const PHOTO_LIMIT_RULE = "photoLimit";

/** The setting as a usable count: anything unreadable is the default, anything out of range is clamped. */
export function normalizePhotoLimit(value: unknown): number {
	const n = typeof value === "string" ? Number(value) : value;
	if (typeof n !== "number" || !Number.isInteger(n)) {
		return PHOTO_LIMIT.default;
	}
	return Math.min(PHOTO_LIMIT.ceiling, Math.max(PHOTO_LIMIT.min, n));
}

/**
 * Refuses a photo count past the limit unless it is an edit that does not
 * add any: content saved before the limit (or before the admin lowered it)
 * stays editable and can lose photos, but cannot gain one while above it.
 * `previousCount` is null or undefined on a create.
 */
export function photoLimitIssue(
	count: number,
	previousCount: number | null | undefined,
	limit: unknown,
): FieldIssue | null {
	const max = normalizePhotoLimit(limit);
	if (count <= max) return null;
	if (typeof previousCount === "number" && count <= previousCount) return null;
	return { path: "images", rule: PHOTO_LIMIT_RULE, params: { max } };
}

/** Whether a picker may offer one more photo. */
export function canAddPhoto(count: number, limit: unknown): boolean {
	return count < normalizePhotoLimit(limit);
}

/** How many more photos a picker may take in one go. */
export function photosRemaining(count: number, limit: unknown): number {
	return Math.max(0, normalizePhotoLimit(limit) - count);
}
