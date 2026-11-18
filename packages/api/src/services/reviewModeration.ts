import type { Payload } from "payload";
import { ERROR_CODES } from "../lib/errors";
import { withTransaction } from "../lib/transactions";
import {
	type Actor,
	assertModerator,
	ModerationError,
	writeLog,
} from "./moderation";
import { photoIds } from "./reviewPhotos";

/** A moderator takes one photo off a review; the review itself stays. */
export async function removeReviewPhoto(
	payload: Payload,
	actor: Actor,
	reviewId: string,
	mediaId: string,
	note?: string | null,
): Promise<{ id: string; photos: string[] }> {
	assertModerator(actor);

	const review = await payload
		.findByID({
			collection: "reviews",
			id: reviewId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!review) {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
	const current = photoIds(review.photos);
	if (!current.includes(mediaId)) {
		throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
	}
	const photos = current.filter((id) => id !== mediaId);

	return withTransaction(payload, async (req) => {
		await payload.update({
			collection: "reviews",
			id: reviewId,
			req,
			overrideAccess: true,
			data: { photos },
		});
		await writeLog(
			payload,
			{
				actor,
				action: "review.photo_remove",
				targetType: "review",
				targetId: reviewId,
				note: typeof note === "string" && note.trim() ? note.trim() : null,
				metadata: { mediaId },
			},
			req,
		);
		return { id: reviewId, photos };
	});
}
