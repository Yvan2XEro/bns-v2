import type { Payload } from "payload";
import { updateUserRating } from "../hooks/reviews";
import { relationId } from "../lib/relationId";
import type { Dispute } from "../payload-types";

type ReviewPayload = Pick<Payload, "find" | "update">;

export async function holdOrderReviews(
	payload: ReviewPayload,
	orderId: string,
	buyerId: string,
): Promise<void> {
	const reviews = await payload.find({
		collection: "reviews",
		where: {
			and: [
				{ order: { equals: orderId } },
				{ reviewer: { equals: buyerId } },
				{ status: { equals: "published" } },
			],
		},
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});
	for (const review of reviews.docs) {
		await payload.update({
			collection: "reviews",
			id: String(review.id),
			overrideAccess: true,
			data: { status: "held_dispute" },
		});
	}
}

export async function resolveHeldReviews(
	payload: ReviewPayload,
	dispute: Dispute,
	action: "published" | "removed",
): Promise<string[]> {
	const orderId = relationId(dispute.order);
	if (!orderId) return [];
	const reviews = await payload.find({
		collection: "reviews",
		where: {
			and: [
				{ order: { equals: orderId } },
				{ status: { equals: "held_dispute" } },
			],
		},
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});
	for (const review of reviews.docs) {
		await payload.update({
			collection: "reviews",
			id: String(review.id),
			overrideAccess: true,
			data: { status: action },
		});
		if (action === "published") {
			const reviewedUserId = relationId(review.reviewedUser);
			if (reviewedUserId) {
				await updateUserRating({ req: { payload }, reviewedUserId });
			}
		}
	}
	return reviews.docs.map((review) => String(review.id));
}

export async function publishHeldReviews(
	payload: ReviewPayload,
	now = new Date(),
): Promise<string[]> {
	const boundary = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
	const resolved = await payload.find({
		collection: "disputes",
		where: {
			and: [
				{
					status: {
						in: ["resolved_buyer", "resolved_seller", "resolved_split"],
					},
				},
				{ "resolution.decidedAt": { less_than_equal: boundary } },
				{ "resolution.reasonCode": { not_equals: "review_extortion" } },
			],
		},
		limit: 500,
		depth: 0,
		overrideAccess: true,
	});
	const published: string[] = [];
	for (const dispute of resolved.docs) {
		published.push(
			...(await resolveHeldReviews(payload, dispute, "published")),
		);
	}
	return published;
}
