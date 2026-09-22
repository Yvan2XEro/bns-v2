import type { Payload } from "payload";
import { ERROR_CODES, type ErrorCode, fallbackMessage } from "../lib/errors";
import type { TxReq } from "../lib/transactions";

export class ReviewRuleError extends Error {
	code: ErrorCode;
	status: number;

	constructor(code: ErrorCode, status: number) {
		super(fallbackMessage(code));
		this.name = "ReviewRuleError";
		this.code = code;
		this.status = status;
	}
}

async function exists(
	payload: Payload,
	collection: "reviews" | "conversations" | "contact-reveals",
	where: Record<string, unknown>,
	req?: TxReq,
): Promise<boolean> {
	const result = await payload.find({
		collection,
		where: where as never,
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return result.docs.length > 0;
}

/** P4 adds a completed order as a qualifying interaction. */
export async function haveInteracted(
	payload: Payload,
	reviewerId: string,
	reviewedUserId: string,
	req?: TxReq,
): Promise<boolean> {
	const talked = await exists(
		payload,
		"conversations",
		{
			and: [
				{ participants: { equals: reviewerId } },
				{ participants: { equals: reviewedUserId } },
			],
		},
		req,
	);
	if (talked) return true;
	return exists(
		payload,
		"contact-reveals",
		{
			and: [
				{ viewer: { equals: reviewerId } },
				{ seller: { equals: reviewedUserId } },
			],
		},
		req,
	);
}

export async function assertReviewAllowed(
	payload: Payload,
	{
		reviewerId,
		reviewedUserId,
	}: { reviewerId: string; reviewedUserId: string },
	req?: TxReq,
): Promise<void> {
	if (reviewerId === reviewedUserId) {
		throw new ReviewRuleError(ERROR_CODES.reviewSelf, 400);
	}
	const duplicate = await exists(
		payload,
		"reviews",
		{
			and: [
				{ reviewer: { equals: reviewerId } },
				{ reviewedUser: { equals: reviewedUserId } },
			],
		},
		req,
	);
	if (duplicate) throw new ReviewRuleError(ERROR_CODES.reviewDuplicate, 409);
	if (!(await haveInteracted(payload, reviewerId, reviewedUserId, req))) {
		throw new ReviewRuleError(ERROR_CODES.reviewNoInteraction, 403);
	}
}
