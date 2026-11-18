/**
 * The photos a seller picked, each with its own upload state, so one bad
 * network moment fails one photo — retried with a tap or on reconnect —
 * instead of the whole batch.
 */
export type PhotoUploadStatus = "uploading" | "failed";

export interface PendingPhoto {
	key: string;
	/** The picked file's local URI, shown at once as the thumbnail. */
	uri: string;
	status: PhotoUploadStatus;
	/** The reason, as the API or the network gave it. */
	error?: string;
}

/** At most this many uploads at a time: more only slows each one on 3G. */
export const PHOTO_UPLOAD_CONCURRENCY = 2;

/** The next photos to start, oldest first, within the concurrency cap. */
export function nextToUpload<T extends { key: string }>(
	waiting: T[],
	running: number,
	limit = PHOTO_UPLOAD_CONCURRENCY,
): T[] {
	return waiting.slice(0, Math.max(0, limit - running));
}

/** Moves one item to the front: the first photo is the listing's main one. */
export function makeMain<T>(items: T[], index: number): T[] {
	if (index <= 0 || index >= items.length) return items;
	const next = [...items];
	const [picked] = next.splice(index, 1);
	return picked === undefined ? items : [picked, ...next];
}
