import type { Payload } from "payload";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import type { TxReq } from "../lib/transactions";

export class ReviewRuleError extends ServiceError {
	constructor(code: ErrorCode, status: number) {
		super(code, status);
		this.name = "ReviewRuleError";
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
	// Scoped to `shop: { exists: false }`: a shop review and a personal review
	// of the same pair are different rows under the three-field index (see
	// `assertOrderReviewAllowed`), so an existing shop review must never block
	// the one personal review this check guards.
	const duplicate = await exists(
		payload,
		"reviews",
		{
			and: [
				{ reviewer: { equals: reviewerId } },
				{ reviewedUser: { equals: reviewedUserId } },
				{ shop: { exists: false } },
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

interface OrderReviewTarget {
	shop: string;
	reviewedUser: string;
}

/**
 * Resolves what an order review would target — the shop and its owner — and
 * the order's current state, without deciding whether the review is allowed.
 * Shared by `assertOrderReviewAllowed` (the create-time check) and
 * `translateReviewWriteConflict`'s caller (the race-loser's afterError path),
 * so both agree on which review a given order actually refers to.
 */
export async function findOrderReviewTarget(
	payload: Payload,
	orderId: string,
	req?: TxReq,
): Promise<{
	buyerId: string | null;
	status: string;
	target: OrderReviewTarget | null;
}> {
	const order = await payload.findByID({
		collection: "orders",
		id: orderId,
		depth: 0,
		overrideAccess: true,
		req,
	});

	const buyerId = relationId(order.buyer);
	const shopId = relationId(order.shop);
	if (!shopId) return { buyerId, status: order.status, target: null };

	const shop = await payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const reviewedUserId = relationId(shop.owner);
	if (!reviewedUserId) return { buyerId, status: order.status, target: null };

	return {
		buyerId,
		status: order.status,
		target: { shop: shopId, reviewedUser: reviewedUserId },
	};
}

/**
 * Exported so `order-actions-parity.int.spec.ts` can pin both clients'
 * `review_shop` cells to exactly this list rather than to a transcription.
 */
export const ORDER_REVIEWABLE_STATUSES: ReadonlySet<string> = new Set([
	"delivered",
	"completed",
]);

/**
 * The order path P4 adds to the interaction rule above: a delivered or
 * completed order from the caller stands in for a conversation or a contact
 * reveal (A4, docs/superpowers/specs/2026-09-15-p4-cod-orders-design.md).
 * Every refusal here reuses `review.noInteraction` — from the reviewer's
 * side, an order that is not theirs, or not yet delivered, is exactly "no
 * qualifying interaction yet".
 */
export async function assertOrderReviewAllowed(
	payload: Payload,
	{ reviewerId, orderId }: { reviewerId: string; orderId: string },
	req?: TxReq,
): Promise<OrderReviewTarget> {
	const { buyerId, status, target } = await findOrderReviewTarget(
		payload,
		orderId,
		req,
	);

	if (
		!buyerId ||
		buyerId !== reviewerId ||
		!ORDER_REVIEWABLE_STATUSES.has(status) ||
		!target
	) {
		throw new ReviewRuleError(ERROR_CODES.reviewNoInteraction, 403);
	}

	const duplicate = await exists(
		payload,
		"reviews",
		{
			and: [
				{ reviewer: { equals: reviewerId } },
				{ reviewedUser: { equals: target.reviewedUser } },
				{ shop: { equals: target.shop } },
			],
		},
		req,
	);
	if (duplicate) throw new ReviewRuleError(ERROR_CODES.reviewDuplicate, 409);

	return target;
}

/**
 * True for the two shapes a (reviewer, reviewedUser, shop) unique-index
 * violation can take: the raw Mongo driver error, and the `ValidationError`
 * Payload's mongodb adapter wraps it in before it reaches a collection hook.
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
					fieldError.path === "reviewer" ||
					fieldError.path === "reviewedUser" ||
					fieldError.path === "shop",
			),
		);
	}
	return false;
}

/**
 * Closes the race the pre-check above cannot: two creates can both pass it
 * before either is written, and only one survives the database's unique
 * (reviewer, reviewedUser, shop) index (migration
 * 20261002_000100_p4_review_shop_index, replacing P0's two-field one). Called
 * with the error the write itself raised; re-reads to confirm the tuple now
 * exists before translating it into the same review.duplicate the pre-check
 * throws, so the caller cannot tell which path rejected them. Anything else —
 * a write that failed for an unrelated reason, or an index hit the re-read
 * cannot confirm — is left alone (returns `undefined`) so the original error
 * keeps its own response.
 *
 * `shop` is optional and defaults to the personal-review scope
 * (`shop: { exists: false }`), mirroring `assertReviewAllowed`'s own
 * duplicate check, so a race on a personal review is never confirmed against
 * an unrelated shop review of the same pair.
 */
export async function translateReviewWriteConflict(
	payload: Payload,
	{
		reviewerId,
		reviewedUserId,
		shop,
	}: { reviewerId: string; reviewedUserId: string; shop?: string | null },
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
				shop ? { shop: { equals: shop } } : { shop: { exists: false } },
			],
		},
		req,
	);
	return duplicate
		? new ReviewRuleError(ERROR_CODES.reviewDuplicate, 409)
		: undefined;
}
