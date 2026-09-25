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
	// Cheap to bypass in P0: any signed-in user can open a conversation with the
	// target and review immediately afterwards, since a conversation only has
	// to include both participants, not carry any real exchange. P4 replaces
	// this branch with a delivered order, which is not self-servable the same
	// way.
	if (!(await haveInteracted(payload, reviewerId, reviewedUserId, req))) {
		throw new ReviewRuleError(ERROR_CODES.reviewNoInteraction, 403);
	}
}

/**
 * True for the two shapes a (reviewer, reviewedUser) unique-index violation
 * can take: the raw Mongo driver error, and the `ValidationError` Payload's
 * mongodb adapter wraps it in before it reaches a collection hook.
 */
export function isReviewUniqueViolation(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const err = error as {
		code?: unknown;
		name?: string;
		data?: { errors?: { path?: string }[] };
	};
	if (err.code === 11000) return true;
	if (err.name === "ValidationError") {
		return Boolean(
			err.data?.errors?.some(
				(fieldError) =>
					fieldError.path === "reviewer" || fieldError.path === "reviewedUser",
			),
		);
	}
	return false;
}

/**
 * Closes the race the pre-check above cannot: two creates can both pass it
 * before either is written, and only one survives the database's unique
 * (reviewer, reviewedUser) index (migration 20260915_000100_p0_reviews_audit,
 * when it was able to create it). Called with the error the write itself
 * raised; re-reads to confirm the pair now exists before translating it into
 * the same review.duplicate the pre-check throws, so the caller cannot tell
 * which path rejected them. Anything else — a write that failed for an
 * unrelated reason, or an index hit the re-read cannot confirm — is left
 * alone (returns `undefined`) so the original error keeps its own response.
 */
export async function translateReviewWriteConflict(
	payload: Payload,
	{
		reviewerId,
		reviewedUserId,
	}: { reviewerId: string; reviewedUserId: string },
	error: unknown,
	req?: TxReq,
): Promise<ReviewRuleError | undefined> {
	if (!isReviewUniqueViolation(error)) return undefined;
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
	return duplicate
		? new ReviewRuleError(ERROR_CODES.reviewDuplicate, 409)
		: undefined;
}
