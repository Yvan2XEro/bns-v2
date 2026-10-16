import {
	addReviewPhotos,
	REVIEW_PHOTO_MAX_BYTES,
	REVIEW_PHOTO_MIME_TYPES,
	REVIEW_PHOTOS_MAX,
	type ReviewPhotoIssue,
} from "../../../api/src/contracts/reviewPhotos";

export { REVIEW_PHOTO_MIME_TYPES, REVIEW_PHOTOS_MAX };

export interface PendingReviewPhoto {
	key: string;
	file: File;
	previewUrl: string;
	mimeType: string;
	size: number;
}

export function pendingPhoto(
	file: File,
	key: string,
	previewUrl: string,
): PendingReviewPhoto {
	return { key, file, previewUrl, mimeType: file.type, size: file.size };
}

/** The same rule the API enforces, run before anything is uploaded. */
export function addPendingPhotos(
	current: readonly PendingReviewPhoto[],
	picked: readonly PendingReviewPhoto[],
) {
	return addReviewPhotos(current, picked);
}

export const REVIEW_PHOTO_ISSUE_KEYS: Record<ReviewPhotoIssue, string> = {
	tooMany: "reviewPhotoTooMany",
	invalidType: "reviewPhotoInvalidType",
	tooLarge: "reviewPhotoTooLarge",
};

export const REVIEW_PHOTO_ISSUE_PARAMS = {
	max: REVIEW_PHOTOS_MAX,
	size: Math.round(REVIEW_PHOTO_MAX_BYTES / (1024 * 1024)),
};

/** A review read at depth 1 carries populated media; anything else is skipped. */
export function populatedReviewPhotos(
	photos: unknown,
): { id: string; url: string }[] {
	if (!Array.isArray(photos)) return [];
	return photos.flatMap((photo) =>
		photo &&
		typeof photo === "object" &&
		typeof (photo as { url?: unknown }).url === "string"
			? [
					{
						id: String((photo as { id?: unknown }).id),
						url: (photo as { url: string }).url,
					},
				]
			: [],
	);
}
