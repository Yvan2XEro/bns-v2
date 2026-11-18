import type { Payload } from "payload";
import { type OrderViewer, requireOrderAudience } from "../access/orderAccess";
import type { DisputeView } from "../contracts/disputes";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import type { Dispute } from "../payload-types";

const OPEN_STATUSES = [
	"open",
	"awaiting_seller",
	"awaiting_buyer",
	"under_review",
] as const;

function allowedActions(
	dispute: Dispute,
	role: "buyer" | "seller" | "moderator",
): string[] {
	if (role === "moderator") return [];
	const actions: string[] = [];
	const active = OPEN_STATUSES.includes(
		dispute.status as (typeof OPEN_STATUSES)[number],
	);
	const expected =
		dispute.status === "awaiting_buyer"
			? "buyer"
			: dispute.status === "awaiting_seller"
				? "seller"
				: null;
	if (active) actions.push("message", "upload_evidence");
	if (expected === role) {
		actions.push("respond_accept", "respond_propose", "respond_contest");
	}
	if (dispute.proposal?.status === "open" && dispute.proposal.byType !== role) {
		actions.push("proposal_accept", "proposal_reject");
	}
	if (dispute.status === "under_review") actions.push("escalate");
	if (
		active &&
		dispute.openedByType === role &&
		["open", "awaiting_seller", "awaiting_buyer"].includes(dispute.status ?? "")
	)
		actions.push("withdraw");
	if (dispute.status === "open" && dispute.openedByType === role)
		actions.push("submit");
	return actions;
}

export async function getDisputeView(
	payload: Payload,
	viewer: OrderViewer,
	disputeId: string,
): Promise<DisputeView> {
	let dispute: Dispute;
	try {
		dispute = await payload.findByID({
			collection: "disputes",
			id: disputeId,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	const orderId = relationId(dispute.order);
	const shopId = relationId(dispute.shop);
	if (!orderId || !shopId) throw new ServiceError(ERROR_CODES.notFound, 404);
	const { order, audience } = await requireOrderAudience(
		payload,
		viewer,
		orderId,
	);
	const [shop, messageRows, evidenceRows, events, items, snapshotItems] =
		await Promise.all([
			payload.findByID({
				collection: "shops",
				id: shopId,
				depth: 0,
				overrideAccess: true,
			}),
			payload.find({
				collection: "dispute-messages",
				where: {
					and: [
						{ dispute: { equals: disputeId } },
						...(audience.kind === "staff"
							? []
							: [{ visibility: { equals: "parties" } }]),
					],
				},
				limit: 0,
				pagination: false,
				sort: "createdAt",
				depth: 0,
				overrideAccess: true,
			}),
			payload.find({
				collection: "dispute-evidence",
				where: {
					and: [
						{ dispute: { equals: disputeId } },
						...(audience.kind === "staff"
							? []
							: [{ visibility: { equals: "parties" } }]),
					],
				},
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			}),
			payload.find({
				collection: "order-events",
				where: { order: { equals: orderId } },
				limit: 0,
				pagination: false,
				sort: "createdAt",
				depth: 0,
				overrideAccess: true,
			}),
			Promise.all(
				(dispute.items ?? []).map(async (entry) => {
					const id = relationId(entry.orderItem);
					if (!id) return null;
					const item = await payload.findByID({
						collection: "order-items",
						id,
						depth: 0,
						overrideAccess: true,
					});
					return {
						orderItemId: id,
						title: item.snapshot?.title ?? "",
						quantity: Number(entry.quantity ?? 0),
					};
				}),
			),
			payload.find({
				collection: "order-items",
				where: { order: { equals: orderId } },
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			}),
		]);
	const isModerator = audience.kind === "staff";
	const certificateId = relationId(dispute.effects?.certificate);
	const resolution = dispute.resolution?.outcome
		? {
				outcome: dispute.resolution.outcome,
				refundAmount: Number(dispute.resolution.refundAmount ?? 0),
				breakdown: {
					goods: Number(dispute.resolution.breakdown?.goods ?? 0),
					outboundDelivery: Number(
						dispute.resolution.breakdown?.outboundDelivery ?? 0,
					),
					returnShipping: Number(
						dispute.resolution.breakdown?.returnShipping ?? 0,
					),
					buyerProtectionFee: Number(
						dispute.resolution.breakdown?.buyerProtectionFee ?? 0,
					),
					deduction: Number(dispute.resolution.breakdown?.deduction ?? 0),
				},
				returnRequired: Boolean(dispute.resolution.returnRequired),
				returnShippingPaidBy:
					dispute.resolution.returnShippingPaidBy === "seller" ||
					dispute.resolution.returnShippingPaidBy === "buyer"
						? dispute.resolution.returnShippingPaidBy
						: null,
				liableParty: dispute.resolution.liableParty ?? "none",
				reasonCode: dispute.resolution.reasonCode ?? "other",
				publicStatement: {
					fr: dispute.resolution.publicStatement?.fr ?? "",
					en: dispute.resolution.publicStatement?.en ?? "",
				},
				decidedByType: dispute.resolution.decidedByType ?? "system",
				decidedAt: dispute.resolution.decidedAt ?? "",
				certificateAvailable: Boolean(certificateId),
			}
		: null;
	const viewRole = isModerator
		? "moderator"
		: audience.kind === "buyer"
			? "buyer"
			: "seller";
	return {
		id: String(dispute.id),
		number: dispute.number,
		orderId,
		orderNumber: order.orderNumber,
		shopId,
		shopName: shop.name ?? "",
		subject: dispute.subject,
		reason: dispute.reason,
		status: dispute.status,
		paymentMethod: dispute.paymentMethod,
		amountAtStake: Number(dispute.amountAtStake ?? 0),
		items: items.filter((item) => item !== null),
		requestedOutcome: dispute.requestedOutcome,
		requestedAmount: dispute.requestedAmount ?? null,
		openedByType: dispute.openedByType,
		deadlines: {
			submitBy: dispute.deadlines?.submitBy ?? null,
			respondBy: dispute.deadlines?.respondBy ?? null,
			reviewDueAt: dispute.deadlines?.reviewDueAt ?? null,
		},
		proposal:
			dispute.proposal?.status && dispute.proposal.expiresAt
				? {
						amount: Number(dispute.proposal.amount ?? 0),
						returnRequired: Boolean(dispute.proposal.returnRequired),
						byType: dispute.proposal.byType ?? "system",
						round: Number(dispute.proposal.round ?? 0),
						status: dispute.proposal.status,
						expiresAt: dispute.proposal.expiresAt,
					}
				: null,
		resolution,
		returnCaseId: relationId(dispute.effects?.returnCase),
		viewerRole: viewRole,
		messages: messageRows.docs.map((message) => ({
			id: String(message.id),
			authorType: message.authorType ?? "system",
			kind: message.kind ?? "message",
			body: message.redactedAt ? null : (message.body ?? null),
			redacted: Boolean(message.redactedAt),
			evidenceIds: (message.evidence ?? [])
				.map((item) => relationId(item))
				.filter((id): id is string => Boolean(id)),
			at: message.createdAt,
		})),
		evidence: await Promise.all(
			evidenceRows.docs.map(async (evidence) => {
				let sha256Reused = false;
				if (isModerator && evidence.sha256) {
					const matches = await payload.count({
						collection: "dispute-evidence",
						where: {
							and: [
								{ sha256: { equals: evidence.sha256 } },
								{ id: { not_equals: String(evidence.id) } },
							],
						},
						overrideAccess: true,
					});
					sha256Reused = matches.totalDocs > 0;
				}
				return {
					id: String(evidence.id),
					kind: evidence.kind,
					mimeType: evidence.mimeType ?? "application/octet-stream",
					size: Number(evidence.size ?? 0),
					uploadedByType: evidence.uploadedByType,
					capturedAt: evidence.capturedAt ?? null,
					sha256Reused,
					visibility: evidence.visibility,
				};
			}),
		),
		systemEvidence: {
			timeline: events.docs.map((event) => ({
				type: event.type,
				at: event.createdAt,
			})),
			handover: order.handover?.method
				? {
						method: order.handover.method,
						verifiedAt: order.handover.verifiedAt ?? null,
					}
				: null,
			payment: order.paymentStatus
				? {
						paymentStatus: order.paymentStatus,
						refundedAmount: Number(order.settlement?.refundedAmount ?? 0),
					}
				: null,
			snapshot: isModerator
				? snapshotItems.docs.map((item) => ({
						id: String(item.id),
						snapshot: item.snapshot ?? null,
						quantity: Number(item.quantity ?? 0),
						unitPrice: Number(item.unitPrice ?? 0),
					}))
				: null,
		},
		allowedActions: allowedActions(dispute, viewRole),
	};
}
