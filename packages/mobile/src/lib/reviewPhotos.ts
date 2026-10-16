import {
	addReviewPhotos,
	REVIEW_PHOTO_MAX_BYTES,
	REVIEW_PHOTOS_MAX,
	type ReviewPhotoIssue,
} from "../../../api/src/contracts/reviewPhotos";

export { REVIEW_PHOTOS_MAX };

export interface PendingReviewPhoto {
	uri: string;
	fileName: string | null;
	mimeType: string | null;
	size: number | null;
}

/** What `expo-image-picker` hands back, reduced to what the rule reads. */
export function pendingPhotoFromAsset(asset: {
	uri: string;
	fileName?: string | null;
	mimeType?: string | null;
	fileSize?: number | null;
}): PendingReviewPhoto {
	return {
		uri: asset.uri,
		fileName: asset.fileName ?? null,
		mimeType: asset.mimeType ?? null,
		size: asset.fileSize ?? null,
	};
}

/** The same rule the API enforces, run before anything is uploaded. */
export function addPendingPhotos(
	current: readonly PendingReviewPhoto[],
	picked: readonly PendingReviewPhoto[],
) {
	return addReviewPhotos(current, picked);
}

export const REVIEW_PHOTO_ISSUE_KEYS: Record<ReviewPhotoIssue, string> = {
	tooMany: "purchases.reviewPhotoTooMany",
	invalidType: "purchases.reviewPhotoInvalidType",
	tooLarge: "purchases.reviewPhotoTooLarge",
};

export const REVIEW_PHOTO_ISSUE_PARAMS = {
	max: REVIEW_PHOTOS_MAX,
	size: Math.round(REVIEW_PHOTO_MAX_BYTES / (1024 * 1024)),
};
