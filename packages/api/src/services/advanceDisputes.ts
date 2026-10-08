import type { Payload, PayloadRequest } from "payload";
import { businessDaysAfter } from "../lib/caseMath";
import { getDisputeSettings } from "../lib/caseSettings";
import { proofChecklist, silenceOutcome } from "../lib/disputeRules";
import { relationId } from "../lib/relationId";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { Dispute } from "../payload-types";
import {
	notifyDisputeDeadlineReminder,
	notifyDisputeReviewOverdue,
} from "./caseNotifications";
import { applyOutcome } from "./disputeOutcome";
import { moveDispute } from "./disputes";
import { applyReservedTransition } from "./orders/transitions";
import { findActiveHold, releaseHold } from "./payoutHolds";

const ACTIVE_RETURN_STATUSES = [
	"requested",
	"approved",
	"awaiting_shipment",
	"in_transit",
	"received",
	"inspected",
	"disputed",
	"refund_pending",
] as const;

const WAITING_STATUSES = ["awaiting_seller", "awaiting_buyer"] as const;

function isWaiting(
	status: Dispute["status"],
): status is (typeof WAITING_STATUSES)[number] {
	return status === "awaiting_seller" || status === "awaiting_buyer";
}

function isDue(value: string | null | undefined, now: Date): boolean {
	return Boolean(value && Date.parse(value) <= now.getTime());
}

async function loadDispute(req: PayloadRequest, id: string): Promise<Dispute> {
	return req.payload.findByID({
		collection: "disputes",
		id,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

async function advanceOne(
	payload: Payload,
	id: string,
	now: Date,
): Promise<
	| "resolved"
	| "review"
	| "submitted"
	| "withdrawn"
	| "reminded"
	| "reviewOverdue"
	| null
> {
	return withTransaction(payload, async (req) => {
		let dispute = await loadDispute(req, id);
		if (
			dispute.status === "under_review" &&
			isDue(dispute.deadlines?.reviewDueAt, now) &&
			!dispute.deadlines?.reviewOverdueNotifiedAt
		) {
			const updated = await req.payload.update({
				collection: "disputes",
				id,
				req,
				overrideAccess: true,
				data: {
					deadlines: {
						...dispute.deadlines,
						reviewOverdueNotifiedAt: now.toISOString(),
					},
				},
			});
			const notify = () => notifyDisputeReviewOverdue(req, updated);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return "reviewOverdue";
		}
		if (dispute.status === "open" && isDue(dispute.deadlines?.submitBy, now)) {
			const required =
				dispute.reason === "counterfeit"
					? 2
					: ["not_received", "seller_no_show"].includes(dispute.reason)
						? 0
						: 1;
			const count = await req.payload.count({
				collection: "dispute-evidence",
				where: {
					and: [
						{ dispute: { equals: id } },
						{ uploadedByType: { equals: dispute.openedByType } },
						{ visibility: { equals: "parties" } },
					],
				},
				overrideAccess: true,
				req,
			});
			if (count.totalDocs < required) {
				dispute = await moveDispute(req, dispute, "withdrawn", {
					type: "system",
					at: now,
					note: "The opener did not submit the required evidence in time.",
				});
				const orderId = relationId(dispute.order);
				if (orderId) {
					const order = await req.payload.findByID({
						collection: "orders",
						id: orderId,
						depth: 0,
						overrideAccess: true,
						req,
					});
					const [activeReturns, activeDisputes] = await Promise.all([
						req.payload.find({
							collection: "return-cases",
							where: {
								and: [
									{ order: { equals: orderId } },
									{ status: { in: [...ACTIVE_RETURN_STATUSES] } },
								],
							},
							limit: 1,
							depth: 0,
							overrideAccess: true,
							req,
						}),
						req.payload.find({
							collection: "disputes",
							where: {
								and: [
									{ order: { equals: orderId } },
									{ id: { not_equals: id } },
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
						}),
					]);
					const shopId = relationId(order.shop);
					const hold = shopId
						? await findActiveHold(req, {
								scope: "order",
								shop: shopId,
								order: orderId,
								reason: "dispute_open",
							})
						: null;
					if (hold) {
						await releaseHold(req, String(hold.id), {
							note: `Dispute ${dispute.number} was withdrawn after missing evidence.`,
						});
					}
					await applyReservedTransition(
						req,
						order,
						{
							...(order.status === "disputed"
								? {
										status: order.timestamps?.deliveredAt
											? "delivered"
											: "shipped",
									}
								: {}),
							set: {
								activeDispute: activeDisputes.docs[0]?.id ?? null,
								completionHold: activeDisputes.docs.length
									? "dispute"
									: activeReturns.docs.length
										? "return_case"
										: "none",
							},
						},
						{
							type: "order.dispute_withdrawn",
							actorType: "system",
							visibility: "both",
							metadata: { disputeId: id },
						},
					);
				}
				return "withdrawn";
			}
			const settings = await getDisputeSettings(req.payload);
			dispute = await moveDispute(
				req,
				dispute,
				dispute.openedByType === "seller"
					? "awaiting_buyer"
					: "awaiting_seller",
				{
					type: "system",
					at: now,
					note: "Automatically submitted at deadline.",
				},
			);
			await req.payload.update({
				collection: "disputes",
				id,
				req,
				overrideAccess: true,
				data: {
					deadlines: {
						...dispute.deadlines,
						respondBy: new Date(
							now.getTime() + settings.respondHours * 3_600_000,
						).toISOString(),
					},
				},
			});
			return "submitted";
		}

		if (
			isWaiting(dispute.status) &&
			dispute.proposal?.status === "open" &&
			isDue(dispute.proposal.expiresAt, now)
		) {
			const settings = await getDisputeSettings(req.payload);
			dispute = await moveDispute(req, dispute, "under_review", {
				type: "system",
				at: now,
				note: "The settlement proposal expired.",
			});
			await req.payload.update({
				collection: "disputes",
				id,
				req,
				overrideAccess: true,
				data: {
					proposal: { ...dispute.proposal, status: "lapsed" },
					deadlines: {
						...dispute.deadlines,
						reviewDueAt: businessDaysAfter(
							now,
							settings.reviewBusinessDays,
						).toISOString(),
					},
				},
			});
			return "review";
		}

		if (isWaiting(dispute.status) && isDue(dispute.deadlines?.respondBy, now)) {
			if (
				dispute.statusHistory?.at(-1)?.note === "More information requested."
			) {
				const settings = await getDisputeSettings(req.payload);
				const moved = await moveDispute(req, dispute, "under_review", {
					type: "system",
					at: now,
					note: "The requested information was not provided in time.",
				});
				await req.payload.update({
					collection: "disputes",
					id,
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
				return "review";
			}
			const orderId = relationId(dispute.order);
			const order = orderId
				? await req.payload.findByID({
						collection: "orders",
						id: orderId,
						depth: 0,
						overrideAccess: true,
						req,
					})
				: null;
			const verdict = silenceOutcome(
				{
					reason: dispute.reason,
					openedByType: dispute.openedByType === "seller" ? "shop" : "buyer",
				},
				proofChecklist(dispute.reason, {
					otpVerified: Boolean(order?.handover?.verifiedAt),
					podDistanceMeters: null,
					podPhotoIntact: false,
					preShipmentPhotos: false,
					packingBeforeShipment: false,
					snapshotMatch: false,
					brandAuthorisation: false,
					attemptProof: false,
					rescheduleAccepted: false,
				}),
			);
			if (verdict.outcome === "under_review") {
				const settings = await getDisputeSettings(req.payload);
				await moveDispute(req, dispute, "under_review", {
					type: "system",
					at: now,
					note: "Silence did not satisfy the automatic-decision proof rule.",
				});
				await req.payload.update({
					collection: "disputes",
					id,
					req,
					overrideAccess: true,
					data: {
						deadlines: {
							...dispute.deadlines,
							reviewDueAt: businessDaysAfter(
								now,
								settings.reviewBusinessDays,
							).toISOString(),
						},
					},
				});
				return "review";
			}
			await applyOutcome(
				req,
				dispute,
				{
					outcome: verdict.outcome,
					refundAmount:
						verdict.outcome === "resolved_buyer"
							? Number(dispute.amountAtStake ?? 0)
							: 0,
					returnRequired: verdict.returnRequired,
					returnShippingPaidBy: verdict.returnRequired ? "seller" : null,
					liableParty:
						verdict.outcome === "resolved_seller" ? "buyer" : "seller",
					reasonCode: "seller_no_proof",
					publicStatement: {
						fr: "La décision a été prise après expiration du délai de réponse.",
						en: "A decision was made after the response deadline expired.",
					},
				},
				"system",
				undefined,
				now,
			);
			return "resolved";
		}

		const settings = await getDisputeSettings(req.payload);
		if (
			isWaiting(dispute.status) &&
			dispute.deadlines?.respondBy &&
			!dispute.deadlines.reminderSentAt &&
			Date.parse(dispute.deadlines.respondBy) -
				(settings.respondHours - settings.reminderHours) * 3_600_000 <=
				now.getTime()
		) {
			await notifyDisputeDeadlineReminder(req, dispute);
			await req.payload.update({
				collection: "disputes",
				id,
				req,
				overrideAccess: true,
				data: {
					deadlines: {
						...dispute.deadlines,
						reminderSentAt: now.toISOString(),
					},
				},
			});
			return "reminded";
		}
		return null;
	});
}

export async function advanceDisputes(
	payload: Payload,
	now = new Date(),
): Promise<Record<string, number>> {
	const candidates = await payload.find({
		collection: "disputes",
		where: {
			status: {
				in: ["open", "awaiting_seller", "awaiting_buyer", "under_review"],
			},
		},
		limit: 500,
		depth: 0,
		overrideAccess: true,
	});
	const counts: Record<string, number> = {
		resolved: 0,
		review: 0,
		submitted: 0,
		withdrawn: 0,
		reminded: 0,
		reviewOverdue: 0,
	};
	for (const candidate of candidates.docs) {
		const outcome = await advanceOne(payload, String(candidate.id), now);
		if (outcome) counts[outcome] += 1;
	}
	return counts;
}
