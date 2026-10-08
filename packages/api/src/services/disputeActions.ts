import type { Payload, PayloadRequest } from "payload";
import { requireOrderAudience } from "../access/orderAccess";
import { businessDaysAfter } from "../lib/caseMath";
import { getDisputeSettings } from "../lib/caseSettings";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { Dispute } from "../payload-types";
import { notifyDisputeEscalated } from "./caseNotifications";
import { applyOutcome } from "./disputeOutcome";
import { moveDispute } from "./disputes";
import { applyReservedTransition } from "./orders/transitions";
import { findActiveHold, releaseHold } from "./payoutHolds";
import type { ServiceUser } from "./shops";

type ReplyInput = {
	action: "accept" | "propose" | "contest";
	amount?: number;
	returnRequired?: boolean;
	message?: string;
	evidenceIds?: string[];
};

function partyType(audience: "buyer" | "shop") {
	return audience === "buyer" ? "buyer" : "seller";
}

function publicStatement(outcome: "buyer" | "seller" | "split") {
	return {
		fr:
			outcome === "buyer"
				? "Les parties ont convenu d'un remboursement en faveur de l'acheteur."
				: outcome === "seller"
					? "Les parties ont convenu qu'aucun remboursement n'est dû."
					: "Les parties ont convenu d'un remboursement partiel.",
		en:
			outcome === "buyer"
				? "The parties agreed to a refund for the buyer."
				: outcome === "seller"
					? "The parties agreed that no refund is due."
					: "The parties agreed to a partial refund.",
	};
}

function decisionInput(
	outcome: "resolved_buyer" | "resolved_seller" | "resolved_split",
	amount: number,
	returnRequired: boolean,
) {
	return {
		outcome,
		refundAmount: amount,
		returnRequired,
		returnShippingPaidBy: returnRequired ? ("seller" as const) : null,
		liableParty:
			outcome === "resolved_seller" ? ("buyer" as const) : ("seller" as const),
		reasonCode: "agreement" as const,
		publicStatement: publicStatement(
			outcome === "resolved_buyer"
				? "buyer"
				: outcome === "resolved_seller"
					? "seller"
					: "split",
		),
	};
}

async function loadPartyDispute(
	req: PayloadRequest,
	actor: ServiceUser,
	disputeId: string,
): Promise<{ dispute: Dispute; role: "buyer" | "shop" }> {
	const dispute = await req.payload.findByID({
		collection: "disputes",
		id: disputeId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const { audience } = await requireOrderAudience(
		req.payload,
		actor,
		relationId(dispute.order) ?? "",
		req,
	);
	if (audience.kind !== "buyer" && audience.kind !== "shop") {
		throw new ServiceError(ERROR_CODES.disputeNotParty, 403);
	}
	return { dispute, role: audience.kind };
}

export async function respondToDispute(
	payload: Payload,
	actor: ServiceUser,
	disputeId: string,
	input: ReplyInput,
	now = new Date(),
): Promise<Dispute> {
	return withTransaction(
		payload,
		async (req) => {
			const { dispute, role } = await loadPartyDispute(req, actor, disputeId);
			const expected = dispute.status === "awaiting_seller" ? "shop" : "buyer";
			if (
				dispute.status !== "awaiting_seller" &&
				dispute.status !== "awaiting_buyer"
			) {
				throw new ServiceError(ERROR_CODES.disputeInvalidTransition, 409);
			}
			if (role !== expected)
				throw new ServiceError(ERROR_CODES.disputeNotParty, 403);
			if (input.action === "accept") {
				const openerIsBuyer = dispute.openedByType === "buyer";
				const outcome = openerIsBuyer ? "resolved_buyer" : "resolved_seller";
				const amount = openerIsBuyer ? Number(dispute.amountAtStake ?? 0) : 0;
				return applyOutcome(
					req,
					dispute,
					decisionInput(outcome, amount, Boolean(input.returnRequired)),
					"agreement",
					undefined,
					now,
				);
			}
			if (input.action === "propose") {
				const settings = await getDisputeSettings(req.payload);
				const round = Number(dispute.proposal?.round ?? 0) + 1;
				const amount = Number(input.amount);
				if (
					!Number.isSafeInteger(amount) ||
					amount <= 0 ||
					amount > Number(dispute.amountAtStake ?? 0) ||
					round > settings.maxProposalRounds
				) {
					throw new ServiceError(ERROR_CODES.disputeProposalInvalid, 400);
				}
				const text = input.message?.trim();
				if (!text)
					throw new ServiceError(ERROR_CODES.disputeProposalInvalid, 400);
				await req.payload.create({
					collection: "dispute-messages",
					req,
					overrideAccess: true,
					data: {
						dispute: disputeId,
						author: actor.id,
						authorType: partyType(role),
						kind: "proposal",
						body: text,
						visibility: "parties",
					},
				});
				const to = role === "buyer" ? "awaiting_seller" : "awaiting_buyer";
				const moved = await moveDispute(req, dispute, to, {
					type: partyType(role),
					id: actor.id,
					at: now,
					note: "A settlement proposal was submitted.",
				});
				return req.payload.update({
					collection: "disputes",
					id: disputeId,
					req,
					overrideAccess: true,
					data: {
						proposal: {
							amount,
							returnRequired: Boolean(input.returnRequired),
							byType: partyType(role),
							by: actor.id,
							at: now.toISOString(),
							expiresAt: new Date(
								now.getTime() + settings.proposalHours * 3_600_000,
							).toISOString(),
							round,
							status: "open",
						},
						deadlines: {
							...moved.deadlines,
							respondBy: new Date(
								now.getTime() + settings.proposalHours * 3_600_000,
							).toISOString(),
						},
					},
				});
			}
			const evidenceIds = [...new Set(input.evidenceIds ?? [])];
			if (!input.message?.trim() || evidenceIds.length === 0) {
				throw new ServiceError(ERROR_CODES.disputeEvidenceRequired, 400);
			}
			for (const evidenceId of evidenceIds) {
				const evidence = await req.payload.findByID({
					collection: "dispute-evidence",
					id: evidenceId,
					depth: 0,
					overrideAccess: true,
					req,
				});
				const uploader = relationId(evidence.uploadedBy);
				const submittedBySystem = evidence.uploadedByType === "system";
				if (
					relationId(evidence.dispute) !== disputeId ||
					(!submittedBySystem && uploader !== actor.id)
				) {
					throw new ServiceError(ERROR_CODES.disputeEvidenceRequired, 400);
				}
			}
			await req.payload.create({
				collection: "dispute-messages",
				req,
				overrideAccess: true,
				data: {
					dispute: disputeId,
					author: actor.id,
					authorType: partyType(role),
					kind: "message",
					body: input.message.trim(),
					evidence: evidenceIds,
					visibility: "parties",
				},
			});
			const settings = await getDisputeSettings(req.payload);
			const moved = await moveDispute(req, dispute, "under_review", {
				type: partyType(role),
				id: actor.id,
				at: now,
			});
			return req.payload.update({
				collection: "disputes",
				id: disputeId,
				req,
				overrideAccess: true,
				data: {
					deadlines: {
						...moved.deadlines,
						reviewDueAt: businessDaysAfter(
							now,
							settings.reviewBusinessDays,
						).toISOString(),
					},
				},
			});
		},
		{ user: actor },
	);
}

export async function answerProposal(
	payload: Payload,
	actor: ServiceUser,
	disputeId: string,
	action: "accept" | "reject",
	now = new Date(),
): Promise<Dispute> {
	return withTransaction(
		payload,
		async (req) => {
			const { dispute, role } = await loadPartyDispute(req, actor, disputeId);
			const proposal = dispute.proposal;
			if (
				!proposal ||
				proposal.status !== "open" ||
				!proposal.byType ||
				proposal.byType === (role === "buyer" ? "buyer" : "seller")
			) {
				throw new ServiceError(ERROR_CODES.disputeInvalidTransition, 409);
			}
			if (
				proposal.expiresAt &&
				Date.parse(proposal.expiresAt) <= now.getTime()
			) {
				throw new ServiceError(ERROR_CODES.disputeInvalidTransition, 409);
			}
			if (action === "accept") {
				const amount = Number(proposal.amount ?? 0);
				const outcome =
					amount >= Number(dispute.amountAtStake ?? 0)
						? "resolved_buyer"
						: amount === 0
							? "resolved_seller"
							: "resolved_split";
				return applyOutcome(
					req,
					dispute,
					decisionInput(outcome, amount, Boolean(proposal.returnRequired)),
					"agreement",
					undefined,
					now,
				);
			}
			const reviewDeadline = businessDaysAfter(
				now,
				(await getDisputeSettings(req.payload)).reviewBusinessDays,
			).toISOString();
			const moved = await moveDispute(req, dispute, "under_review", {
				type: partyType(role),
				id: actor.id,
				at: now,
				note: "The settlement proposal was rejected.",
			});
			return req.payload.update({
				collection: "disputes",
				id: disputeId,
				req,
				overrideAccess: true,
				data: {
					proposal: { ...proposal, status: "rejected" },
					deadlines: { ...moved.deadlines, reviewDueAt: reviewDeadline },
				},
			});
		},
		{ user: actor },
	);
}

export async function escalateDispute(
	payload: Payload,
	actor: ServiceUser,
	disputeId: string,
	now = new Date(),
): Promise<Dispute> {
	return withTransaction(
		payload,
		async (req) => {
			const { dispute, role } = await loadPartyDispute(req, actor, disputeId);
			if (
				dispute.status !== "awaiting_seller" &&
				dispute.status !== "awaiting_buyer"
			) {
				throw new ServiceError(ERROR_CODES.disputeInvalidTransition, 409);
			}
			const exchanges = await req.payload.count({
				collection: "dispute-messages",
				where: {
					and: [
						{ dispute: { equals: disputeId } },
						{ visibility: { equals: "parties" } },
						{ kind: { in: ["message", "proposal", "proposal_response"] } },
					],
				},
				overrideAccess: true,
				req,
			});
			if (exchanges.totalDocs < 1) {
				throw new ServiceError(ERROR_CODES.disputeInvalidTransition, 409);
			}
			const settings = await getDisputeSettings(req.payload);
			const moved = await moveDispute(req, dispute, "under_review", {
				type: partyType(role),
				id: actor.id,
				at: now,
			});
			const escalated = await req.payload.update({
				collection: "disputes",
				id: disputeId,
				req,
				overrideAccess: true,
				data: {
					deadlines: {
						...moved.deadlines,
						reviewDueAt: businessDaysAfter(
							now,
							settings.reviewBusinessDays,
						).toISOString(),
					},
				},
			});
			const notify = () => notifyDisputeEscalated(req, escalated);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return escalated;
		},
		{ user: actor },
	);
}

export async function withdrawDispute(
	payload: Payload,
	actor: ServiceUser,
	disputeId: string,
	now = new Date(),
): Promise<Dispute> {
	return withTransaction(
		payload,
		async (req) => {
			const { dispute } = await loadPartyDispute(req, actor, disputeId);
			if (
				relationId(dispute.openedBy) !== actor.id ||
				[
					"resolved_buyer",
					"resolved_seller",
					"resolved_split",
					"withdrawn",
				].includes(dispute.status)
			) {
				throw new ServiceError(ERROR_CODES.disputeInvalidTransition, 409);
			}
			const moved = await moveDispute(req, dispute, "withdrawn", {
				type: dispute.openedByType === "buyer" ? "buyer" : "seller",
				id: actor.id,
				at: now,
			});
			const orderId = relationId(dispute.order);
			if (!orderId) return moved;
			const order = await req.payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const activeReturns = await req.payload.find({
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
			const activeDisputes = await req.payload.find({
				collection: "disputes",
				where: {
					and: [
						{ order: { equals: orderId } },
						{ id: { not_equals: disputeId } },
						{
							status: {
								in: [
									"open",
									"awaiting_seller",
									"awaiting_buyer",
									"under_review",
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
			const shopId = relationId(dispute.shop);
			const activeHold = shopId
				? await findActiveHold(req, {
						scope: "order",
						shop: shopId,
						order: orderId,
						reason: "dispute_open",
					})
				: null;
			if (activeHold) {
				await releaseHold(req, String(activeHold.id), {
					releasedBy: actor.id,
					note: `Dispute ${dispute.number} was withdrawn.`,
				});
			}
			await applyReservedTransition(
				req,
				order,
				{
					set: {
						activeDispute: activeDisputes.docs[0]?.id ?? null,
						completionHold: activeDisputes.docs.length
							? "dispute"
							: activeReturns.docs.length
								? "return_case"
								: "none",
						...(order.status === "disputed"
							? {
									status: order.timestamps?.deliveredAt
										? "delivered"
										: "shipped",
								}
							: {}),
					},
					...(order.status === "disputed"
						? {
								status: order.timestamps?.deliveredAt ? "delivered" : "shipped",
							}
						: {}),
				},
				{
					type: "order.dispute_withdrawn",
					actorType: dispute.openedByType === "buyer" ? "buyer" : "seller",
					actor: actor.id,
					visibility: "both",
					metadata: { disputeId },
				},
			);
			return moved;
		},
		{ user: actor },
	);
}
