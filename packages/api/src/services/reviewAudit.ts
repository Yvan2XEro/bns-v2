import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import type { TxReq } from "../lib/transactions";

export interface ReviewAudit {
	selfReviewIds: string[];
	duplicateGroups: {
		reviewer: string;
		reviewedUser: string;
		reviewIds: string[];
	}[];
}

/** Reports reviews the P0 rules would refuse. Deletes nothing: staff decide. */
export async function auditLegacyReviews(
	payload: Payload,
	req?: TxReq,
): Promise<ReviewAudit> {
	const selfReviewIds: string[] = [];
	const pairs = new Map<
		string,
		{ reviewer: string; reviewedUser: string; reviewIds: string[] }
	>();

	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const result = await payload.find({
			collection: "reviews",
			depth: 0,
			limit: 500,
			page,
			sort: "createdAt",
			overrideAccess: true,
			req,
		});
		for (const review of result.docs) {
			const reviewer = relationId(review.reviewer);
			const reviewedUser = relationId(review.reviewedUser);
			if (!reviewer || !reviewedUser) continue;
			if (reviewer === reviewedUser) selfReviewIds.push(String(review.id));
			const key = `${reviewer}:${reviewedUser}`;
			const group = pairs.get(key) ?? { reviewer, reviewedUser, reviewIds: [] };
			group.reviewIds.push(String(review.id));
			pairs.set(key, group);
		}
		hasNextPage = Boolean(result.hasNextPage);
		page += 1;
	}

	return {
		selfReviewIds,
		duplicateGroups: [...pairs.values()].filter(
			(group) => group.reviewIds.length > 1,
		),
	};
}
