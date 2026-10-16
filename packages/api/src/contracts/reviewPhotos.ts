/**
 * Photos a buyer may attach to a review: images only, up to five, each within
 * the media collection's own size limit. Kept equal to `ALLOWED_MEDIA_MIME_TYPES`
 * and `MAX_MEDIA_FILE_SIZE` (hooks/mediaLimits.ts) by review-photos.int.spec.ts,
 * because that hook is not importable from the clients.
 */
export const REVIEW_PHOTOS_MAX = 5;

export const REVIEW_PHOTO_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

export const REVIEW_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type ReviewPhotoIssue = "tooMany" | "invalidType" | "tooLarge";

export interface ReviewPhotoCandidate {
	mimeType?: string | null;
	size?: number | null;
}

/** A missing size is let through: the upload itself answers `upload.tooLarge`. */
export function reviewPhotoIssue(
	file: ReviewPhotoCandidate,
): Exclude<ReviewPhotoIssue, "tooMany"> | null {
	const mime = (file.mimeType ?? "").toLowerCase();
	if (!(REVIEW_PHOTO_MIME_TYPES as readonly string[]).includes(mime)) {
		return "invalidType";
	}
	if (typeof file.size === "number" && file.size > REVIEW_PHOTO_MAX_BYTES) {
		return "tooLarge";
	}
	return null;
}

/**
 * Adds picked files to the ones already held, keeping only valid ones and
 * stopping at the limit. Reports the first refusal so the form can say why
 * a pick was not (fully) taken.
 */
export function addReviewPhotos<T extends ReviewPhotoCandidate>(
	current: readonly T[],
	picked: readonly T[],
): { photos: T[]; issue: ReviewPhotoIssue | null } {
	const photos = [...current];
	let issue: ReviewPhotoIssue | null = null;
	for (const file of picked) {
		const fileIssue = reviewPhotoIssue(file);
		if (fileIssue) {
			issue ??= fileIssue;
			continue;
		}
		if (photos.length >= REVIEW_PHOTOS_MAX) {
			issue ??= "tooMany";
			continue;
		}
		photos.push(file);
	}
	return { photos, issue };
}

/** The ids a review may be saved with: distinct, non-empty, at most the limit. */
export function reviewPhotoIdsIssue(ids: readonly unknown[]): "tooMany" | null {
	return new Set(ids).size > REVIEW_PHOTOS_MAX ? "tooMany" : null;
}
