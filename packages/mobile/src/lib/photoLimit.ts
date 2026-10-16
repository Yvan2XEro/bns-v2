import {
	canAddPhoto,
	normalizePhotoLimit,
	photosRemaining,
} from "../../../api/src/contracts/photoLimit";

export {
	canAddPhoto,
	photosRemaining,
} from "../../../api/src/contracts/photoLimit";

/** What a photo picker shows: the limit, whether it is reached, and how many more it may take. */
export function photoLimitStatus(count: number, limit: unknown) {
	return {
		max: normalizePhotoLimit(limit),
		full: !canAddPhoto(count, limit),
		remaining: photosRemaining(count, limit),
	};
}
