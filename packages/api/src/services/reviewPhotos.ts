import type { Payload } from "payload";
import type { PublicShopReviewPhoto } from "../contracts/publicShopReviews";
import {
	REVIEW_PHOTO_MIME_TYPES,
	reviewPhotoIdsIssue,
} from "../contracts/reviewPhotos";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import type { TxReq } from "../lib/transactions";
import { ReviewRuleError } from "./reviewRules";

export function photoId(value: unknown): string | null {
	if (
		value &&
		typeof value === "object" &&
		"toHexString" in value &&
		typeof (value as { toHexString: unknown }).toHexString === "function"
	) {
		return (value as { toHexString: () => string }).toHexString();
	}
	return relationId(value);
}

export function photoIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids = value.map(photoId).filter((id): id is string => Boolean(id));
	return Array.from(new Set(ids));
}

/**
 * The photos a new review is created with: distinct, at most five, and each
 * an existing image upload. Returns the normalised id list to store.
 */
export async function assertReviewPhotos(
	payload: Payload,
	value: unknown,
	req?: TxReq,
): Promise<string[]> {
	const ids = photoIds(value);
	if (reviewPhotoIdsIssue(ids)) {
		throw new ReviewRuleError(ERROR_CODES.reviewTooManyPhotos, 400);
	}
	if (ids.length === 0) return [];

	// A malformed id can make the adapter throw rather than match nothing;
	// either way it is not an image this review may carry.
	const found = await payload
		.find({
			collection: "media",
			where: { id: { in: ids } },
			limit: ids.length,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => ({ docs: [] }));
	const images = new Set(
		found.docs
			.filter((media) =>
				(REVIEW_PHOTO_MIME_TYPES as readonly string[]).includes(
					String((media as { mimeType?: unknown }).mimeType ?? ""),
				),
			)
			.map((media) => String(media.id)),
	);
	if (ids.some((id) => !images.has(id))) {
		throw new ReviewRuleError(ERROR_CODES.uploadInvalidType, 400);
	}
	return ids;
}

/**
 * After creation nobody adds a photo — not the author, not staff. An update
 * may only keep a subset of what the review already carries.
 */
export function keepExistingPhotos(next: unknown, previous: unknown): string[] {
	const allowed = new Set(photoIds(previous));
	return photoIds(next).filter((id) => allowed.has(id));
}

/** Urls for the photos of reviews the caller already decided are public. */
export async function publicReviewPhotos(
	payload: Payload,
	ids: readonly string[],
): Promise<Map<string, PublicShopReviewPhoto>> {
	const byId = new Map<string, PublicShopReviewPhoto>();
	if (ids.length === 0) return byId;
	const found = await payload.find({
		collection: "media",
		where: { id: { in: [...ids] } },
		limit: ids.length,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	for (const media of found.docs) {
		const url = (media as { url?: unknown }).url;
		if (typeof url === "string" && url) {
			byId.set(String(media.id), { id: String(media.id), url });
		}
	}
	return byId;
}
