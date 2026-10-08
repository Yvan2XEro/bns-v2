import type { PayloadRequest } from "payload";
import type { DisputeOutcomeInput } from "../contracts/disputes";
import { splitAllocation } from "../lib/caseMath";
import { getDisputeSettings, getReturnSettings } from "../lib/caseSettings";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { commitContextOf, onCommit } from "../lib/transactions";
import type { Dispute, Order, ReturnCase } from "../payload-types";
import { notifyDisputeResolved } from "./caseNotifications";
import { sellerLossFeeLine } from "./commission";
import { queueCertificateRender } from "./disputeCertificates";
import { moveDispute } from "./disputes";
import { recordRefusal } from "./orders/risk";
import { applyReservedTransition } from "./orders/transitions";
import { findActiveHold, releaseHold } from "./payoutHolds";
import { adjustResellerCommissionForRefund } from "./purchaseOrders";
import { requestRefund } from "./refunds";
import { moveCase } from "./returns";
import { resolveHeldReviews } from "./reviewRelease";
import { recordRiskSignal } from "./riskSignals";
import { nextNumber } from "./sequences";
import { addStrike } from "./strikes";

export type OutcomeInput = DisputeOutcomeInput;

export type DecisionType = "system" | "agreement" | "moderator";

const SPLIT_STRIKE_REASONS: ReadonlySet<string> = new Set([
	"item_not_conforming",
	"seller_no_proof",
]);

/** The buyer never took delivery, so their review is no verified purchase. */
async function stripVerifiedPurchase(
	req: PayloadRequest,
	orderId: string,
): Promise<void> {
	const reviews = await req.payload.find({
		collection: "reviews",
		where: {
			and: [
				{ order: { equals: orderId } },
				{ verifiedPurchase: { equals: true } },
			],
		},
		limit: 100,
		depth: 0,
		overrideAccess: true,
		req,
	});
	for (const review of reviews.docs) {
		await req.payload.update({
			collection: "reviews",
			id: String(review.id),
			req,
			overrideAccess: true,
			data: { verifiedPurchase: false },
		});
	}
}

function isTerminal(dispute: Dispute): boolean {
	return ["resolved_buyer", "resolved_seller", "resolved_split"].includes(
		dispute.status,
	);
}

function reviewed(dispute: Dispute): boolean {
	return (dispute.statusHistory ?? []).some(
		(entry) => entry.status === "under_review",
	);
}

function refundableCeiling(order: Order, dispute: Dispute): number {
	return Math.max(
		0,
		Number(dispute.amountAtStake ?? order.amounts?.total ?? 0),
	);
}

/** The protection fee rides only a full refund of a protected order, as P5 refunds it. */
function recordedBreakdown(order: Order, refundAmount: number) {
	const goods = Number(order.amounts?.subtotal ?? 0);
	const orderDeliveryFee = Number(
		order.amounts?.deliveryFee ?? order.delivery.fee ?? 0,
	);
	const fee =
		order.paymentMethod === "mobile_money" &&
		refundAmount === Number(order.amounts?.total ?? 0)
			? Number(order.amounts?.buyerProtectionFee ?? 0)
			: 0;
	const allocation = splitAllocation({
		refundAmount: Math.min(refundAmount - fee, goods + orderDeliveryFee),
		goods,
		orderDeliveryFee,
	});
	return {
		goods: allocation.goods,
		outboundDelivery: allocation.outboundDelivery,
		returnShipping: 0,
		buyerProtectionFee: fee,
		deduction: 0,
	};
}

async function loadOrder(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<Order> {
	const orderId = relationId(dispute.order);
	if (!orderId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	return req.payload.findByID({
		collection: "orders",
		id: orderId,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

async function existingReturnCase(
	req: PayloadRequest,
	dispute: Dispute,
): Promise<ReturnCase | null> {
	const id = relationId(dispute.returnCase);
	if (!id) return null;
	return req.payload
		.findByID({
			collection: "return-cases",
			id,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
}

async function createRefundCase(
	req: PayloadRequest,
	dispute: Dispute,
	order: Order,
	input: OutcomeInput,
	now: Date,
): Promise<ReturnCase | null> {
	if (input.refundAmount <= 0) return null;
	const settings = await getReturnSettings(req.payload);
	const orderId = String(order.id);
	const buyer = relationId(order.buyer);
	const shop = relationId(order.shop);
	if (!buyer || !shop) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	const existing = await existingReturnCase(req, dispute);
	if (existing && existing.status === "disputed") {
		await moveCase(req, existing, "closed", {
			actorType: "system",
			at: now,
			note: `Dispute ${dispute.number} resolved; refund handled by a new case.`,
		});
	}

	const number = await nextNumber(req.payload, "RET", now);
	const deadline = input.returnRequired
		? new Date(now.getTime() + settings.nonConformityShipByDays * 86_400_000)
		: null;
	const refundBreakdown = recordedBreakdown(order, input.refundAmount);
	const sellerDirect =
		order.paymentMethod === "cod" ||
		Boolean(existing?.refund?.channel === "seller_direct");
	const created = await req.payload.create({
		collection: "return-cases",
		req,
		overrideAccess: true,
		data: {
			number,
			basis: "non_conformity",
			order: orderId,
			shop,
			buyer,
			items: (dispute.items ?? []).map((item) => ({
				orderItem: relationId(item.orderItem) ?? "",
				quantity: Number(item.quantity ?? 1),
			})),
			openedByType: "system",
			dispute: String(dispute.id),
			returnRequired: input.returnRequired,
			status: input.returnRequired ? "approved" : "refund_pending",
			statusHistory: [
				{
					status: input.returnRequired ? "approved" : "refund_pending",
					actorType: "system",
					at: now.toISOString(),
					note: `Created from dispute ${dispute.number}.`,
				},
			],
			deadlines: deadline
				? {
						shipBy: deadline.toISOString(),
					}
				: {},
			refund: {
				amount: input.refundAmount,
				channel: sellerDirect ? "seller_direct" : "provider",
				breakdown: refundBreakdown,
			},
		},
	});
	if (input.returnRequired) return created;
	if (sellerDirect) return created;
	try {
		const refund = await requestRefund(req, {
			order: orderId,
			amount: input.refundAmount,
			reason: "dispute",
			sourceType: "dispute",
			sourceId: String(dispute.id),
		});
		return req.payload.update({
			collection: "return-cases",
			id: String(created.id),
			req,
			overrideAccess: true,
			data: {
				refund: { ...created.refund, providerRefund: String(refund.id) },
			},
		});
	} catch (error) {
		if (
			!(error instanceof ServiceError) ||
			error.code !== ERROR_CODES.refundWindowExpired
		)
			throw error;
		return req.payload.update({
			collection: "return-cases",
			id: String(created.id),
			req,
			overrideAccess: true,
			data: { refund: { ...created.refund, channel: "seller_direct" } },
		});
	}
}

async function activeReturnCaseForOrder(
	req: PayloadRequest,
	orderId: string,
): Promise<ReturnCase | null> {
	const result = await req.payload.find({
		collection: "return-cases",
		where: {
			and: [
				{ order: { equals: orderId } },
				{
					status: {
						in: [
							"requested",
							"approved",
							"awaiting_shipment",
							"in_transit",
							"received",
							"inspected",
							"disputed",
							"refund_pending",
						],
					},
				},
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return result.docs[0] ?? null;
}

/** Applies the financial and order effects of a decision exactly once. */
export async function applyOutcome(
	req: PayloadRequest,
	disputeInput: Dispute,
	input: OutcomeInput,
	decidedByType: DecisionType,
	decidedBy?: string,
	now = new Date(),
): Promise<Dispute> {
	const dispute = await req.payload.findByID({
		collection: "disputes",
		id: String(disputeInput.id),
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (isTerminal(dispute)) return dispute;
	const order = await loadOrder(req, dispute);
	const maximum = refundableCeiling(order, dispute);
	if (
		!Number.isSafeInteger(input.refundAmount) ||
		input.refundAmount < 0 ||
		input.refundAmount > maximum ||
		(input.outcome === "resolved_buyer" && input.refundAmount <= 0) ||
		(input.outcome === "resolved_seller" && input.refundAmount !== 0) ||
		(input.outcome === "resolved_split" &&
			(input.refundAmount <= 0 || input.refundAmount >= maximum))
	) {
		throw new ServiceError(ERROR_CODES.disputeRefundExceedsOrder, 400);
	}
	const orderId = String(order.id);
	await adjustResellerCommissionForRefund(
		req,
		orderId,
		input.refundAmount,
		"dispute",
		String(dispute.id),
	);
	const shopId = relationId(order.shop);
	if (!shopId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	const refundCase = await createRefundCase(req, dispute, order, input, now);
	let refundId: string | null =
		relationId(refundCase?.refund?.providerRefund) ?? null;
	if (
		order.paymentMethod === "mobile_money" &&
		input.refundAmount > 0 &&
		refundCase?.refund?.channel === "provider" &&
		!refundId &&
		!input.returnRequired
	) {
		const live = await req.payload.find({
			collection: "refunds",
			where: {
				and: [
					{ sourceType: { equals: "dispute" } },
					{ sourceId: { equals: String(dispute.id) } },
					{ status: { not_equals: "failed" } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
			req,
		});
		refundId = live.docs[0] ? String(live.docs[0].id) : null;
	}
	const previousActiveDispute = await req.payload.find({
		collection: "disputes",
		where: {
			and: [
				{ order: { equals: orderId } },
				{ id: { not_equals: String(dispute.id) } },
				{
					status: {
						in: ["open", "awaiting_seller", "awaiting_buyer", "under_review"],
					},
				},
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const activeReturn = await activeReturnCaseForOrder(req, orderId);
	const completionHold = previousActiveDispute.docs.length
		? "dispute"
		: activeReturn
			? "return_case"
			: "none";
	let nextStatus = order.status;
	if (order.status === "disputed") {
		if (input.outcome === "resolved_buyer" && !input.returnRequired) {
			if (dispute.reason === "not_received" && !order.timestamps?.deliveredAt) {
				nextStatus = "cancelled";
			} else if (
				input.refundAmount >= maximum &&
				Boolean(order.timestamps?.deliveredAt)
			) {
				nextStatus = "returned";
			} else {
				nextStatus = order.timestamps?.deliveredAt ? "delivered" : "shipped";
			}
		} else {
			nextStatus = order.timestamps?.deliveredAt ? "delivered" : "shipped";
		}
	}
	await applyReservedTransition(
		req,
		order,
		{
			...(nextStatus !== order.status ? { status: nextStatus } : {}),
			set: {
				activeDispute: previousActiveDispute.docs[0]?.id ?? null,
				completionHold,
			},
		},
		{
			type:
				nextStatus === "returned" ? "order.returned" : "order.dispute_resolved",
			actorType: decidedByType === "moderator" ? "staff" : "system",
			...(decidedBy ? { actor: decidedBy } : {}),
			visibility: "both",
			metadata: {
				disputeId: String(dispute.id),
				outcome: input.outcome,
				refundAmount: input.refundAmount,
			},
		},
	);

	const moderatorDecided = decidedByType === "moderator";
	const sellerLost =
		input.outcome === "resolved_buyer"
			? (moderatorDecided && reviewed(dispute)) || decidedByType === "system"
			: input.outcome === "resolved_split" &&
				moderatorDecided &&
				SPLIT_STRIKE_REASONS.has(input.reasonCode);
	const strikeIds: string[] = [];
	const riskSignalIds: string[] = [];
	if (sellerLost) {
		const strike = await addStrike(
			req,
			{
				shop: shopId,
				kind: "dispute_lost",
				sourceType: "dispute",
				sourceId: String(dispute.id),
			},
			now,
		);
		strikeIds.push(String(strike.id));
	}
	if (sellerLost && moderatorDecided) {
		const signal = await recordRiskSignal(req, {
			subjectType: "shop",
			subjectId: shopId,
			signal: "dispute_lost_seller",
			sourceType: "dispute",
			sourceId: String(dispute.id),
			occurredAt: now,
		});
		riskSignalIds.push(String(signal.id));
		await sellerLossFeeLine(req, dispute, now);
	}
	if (
		dispute.reason === "cod_refused_abuse" &&
		input.outcome === "resolved_seller"
	) {
		await recordRefusal(req, {
			phone: order.delivery.phone,
			orderId,
			reason: "refused_abuse",
		});
		const signal = await recordRiskSignal(req, {
			subjectType: "phone",
			subjectId: order.delivery.phone,
			signal: "cod_refusal_abuse",
			sourceType: "dispute",
			sourceId: String(dispute.id),
			occurredAt: now,
		});
		riskSignalIds.push(String(signal.id));
		await stripVerifiedPurchase(req, orderId);
	}
	if (input.reasonCode === "counterfeit_confirmed") {
		const signal = await recordRiskSignal(req, {
			subjectType: "shop",
			subjectId: shopId,
			signal: "counterfeit_confirmed",
			sourceType: "dispute",
			sourceId: String(dispute.id),
			occurredAt: now,
		});
		riskSignalIds.push(String(signal.id));
		const strike = await addStrike(
			req,
			{
				shop: shopId,
				kind: "counterfeit_confirmed",
				sourceType: "dispute",
				sourceId: String(dispute.id),
			},
			now,
		);
		strikeIds.push(String(strike.id));
	}
	if (decidedByType === "system" && input.outcome === "resolved_buyer") {
		const signal = await recordRiskSignal(req, {
			subjectType: "shop",
			subjectId: shopId,
			signal: "seller_no_response",
			sourceType: "dispute",
			sourceId: String(dispute.id),
			occurredAt: now,
		});
		riskSignalIds.push(String(signal.id));
	}
	const requestedReviewAction =
		input.reasonCode === "review_extortion"
			? "removed"
			: (input.reviewAction ?? "published");
	const reviewIds =
		requestedReviewAction === "removed"
			? await resolveHeldReviews(req.payload, dispute, "removed")
			: [];
	const decisionMessage = await req.payload.create({
		collection: "dispute-messages",
		req,
		overrideAccess: true,
		data: {
			dispute: String(dispute.id),
			authorType: decidedByType === "moderator" ? "moderator" : "system",
			...(decidedBy ? { author: decidedBy } : {}),
			kind: "decision",
			body: `${input.publicStatement.fr}\n\n${input.publicStatement.en}`,
			visibility: "parties",
		},
	});
	void decisionMessage;
	const moved = await moveDispute(req, dispute, input.outcome, {
		type: decidedByType === "moderator" ? "moderator" : "system",
		...(decidedBy ? { id: decidedBy } : {}),
		at: now,
		note: input.reasonCode,
	});
	const evidence = await req.payload.find({
		collection: "dispute-evidence",
		where: {
			and: [
				{ dispute: { equals: String(dispute.id) } },
				{ uploadedByType: { not_equals: "system" } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const disputeSettings = await getDisputeSettings(req.payload);
	const purgeAfter = new Date(
		now.getTime() + disputeSettings.evidenceRetentionDays * 86_400_000,
	).toISOString();
	for (const file of evidence.docs) {
		await req.payload.update({
			collection: "dispute-evidence",
			id: String(file.id),
			req,
			overrideAccess: true,
			data: { purgeAfter },
		});
	}
	const hold = await findActiveHold(req, {
		scope: "order",
		shop: shopId,
		order: orderId,
		reason: "dispute_open",
	});
	let holdsReleased = false;
	if (hold) {
		await releaseHold(req, String(hold.id), {
			releasedBy: decidedBy,
			note: `Dispute ${dispute.number} resolved.`,
		});
		holdsReleased = true;
	}
	const updated = await req.payload.update({
		collection: "disputes",
		id: String(moved.id),
		req,
		overrideAccess: true,
		data: {
			resolution: {
				outcome: input.outcome,
				refundAmount: input.refundAmount,
				breakdown: recordedBreakdown(order, input.refundAmount),
				returnRequired: input.returnRequired,
				returnShippingPaidBy: input.returnShippingPaidBy,
				liableParty: input.liableParty,
				reasonCode: input.reasonCode,
				publicStatement: input.publicStatement,
				decidedByType,
				...(decidedBy ? { decidedBy } : {}),
				decidedAt: now.toISOString(),
			},
			effects: {
				...moved.effects,
				returnCase: refundCase?.id ?? null,
				refund: refundId,
				holdsReleased,
				strikes: strikeIds,
				riskSignals: riskSignalIds,
				reviewAction: reviewIds.length ? "removed" : "published",
			},
		},
	});
	const queueCertificate = () => queueCertificateRender(req, updated);
	if (!onCommit(commitContextOf(req), queueCertificate))
		await queueCertificate();
	const notify = () => notifyDisputeResolved(req, updated);
	if (!onCommit(commitContextOf(req), notify)) await notify();
	return updated;
}
