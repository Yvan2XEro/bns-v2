import type { Payload } from "payload";
import {
	type PublicShopReview,
	type PublicShopReviewPage,
	type PublicShopReviewPhoto,
	SHOP_REVIEWS_PAGE_SIZE,
} from "../contracts/publicShopReviews";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { photoIds, publicReviewPhotos } from "./reviewPhotos";

function firstName(name: unknown): string | null {
	if (typeof name !== "string") return null;
	return name.trim().split(/\s+/)[0] || null;
}

/**
 * A shop's published, verified-purchase reviews, newest first. Read with
 * `overrideAccess` and then cut down to the public shape, so no reviewer id,
 * order or listing ever leaves this function.
 */
export async function publicShopReviews(
	payload: Payload,
	shopId: string,
	page: number,
): Promise<PublicShopReviewPage> {
	const shop = await payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!shop || shop.status !== "active")
		throw new ServiceError(ERROR_CODES.shopNotFound, 404);

	const result = await payload.find({
		collection: "reviews",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ status: { equals: "published" } },
				{ verifiedPurchase: { equals: true } },
			],
		},
		sort: "-createdAt",
		limit: SHOP_REVIEWS_PAGE_SIZE,
		page,
		depth: 0,
		overrideAccess: true,
	});

	const reviewerIds = Array.from(
		new Set(
			result.docs
				.map((review) => relationId(review.reviewer))
				.filter((id): id is string => Boolean(id)),
		),
	);
	const names = new Map<string, string | null>();
	if (reviewerIds.length > 0) {
		const users = await payload.find({
			collection: "users",
			where: { id: { in: reviewerIds } },
			select: { name: true },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		for (const user of users.docs) {
			names.set(String(user.id), firstName(user.name));
		}
	}

	// Only ever the photos of the published reviews read above: a held or
	// removed review's photos never leave this function.
	const photos = await publicReviewPhotos(
		payload,
		Array.from(
			new Set(result.docs.flatMap((review) => photoIds(review.photos))),
		),
	);

	const reviews: PublicShopReview[] = result.docs.map((review) => ({
		id: String(review.id),
		rating: review.rating,
		comment:
			typeof review.comment === "string" && review.comment.trim()
				? review.comment
				: null,
		createdAt: review.createdAt,
		reviewerFirstName: names.get(relationId(review.reviewer) ?? "") ?? null,
		photos: photoIds(review.photos)
			.map((id) => photos.get(id))
			.filter((photo): photo is PublicShopReviewPhoto => Boolean(photo)),
	}));

	return {
		reviews,
		page: result.page ?? page,
		totalPages: result.totalPages,
		total: result.totalDocs,
	};
}
