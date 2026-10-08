import type { Payload, PayloadRequest, Where } from "payload";
import { isAdmin } from "../access/roles";
import { resolveShopRole } from "../access/shopRoles";
import type {
	DisputeOutcomeInput,
	DisputeOutcomePreview,
	ModerationDisputeRow,
	ModerationDisputeSheet,
} from "../contracts/disputes";
import { splitAllocation } from "../lib/caseMath";
import { getDisputeSettings } from "../lib/caseSettings";
import {
	proofChecklist,
	resolvedSellerNeedsOverride,
} from "../lib/disputeRules";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { Dispute, Order } from "../payload-types";
import { notifyDisputeInfoRequested } from "./caseNotifications";
import { applyOutcome } from "./disputeOutcome";
import { moveDispute } from "./disputes";
import { getDisputeView } from "./disputeViews";
import {
	type Actor,
	assertModerator,
	ModerationError,
	writeLog,
} from "./moderation";
import { findActiveHold } from "./payoutHolds";
import { revokeStrikeRow, shopStanding } from "./strikes";

export type ResolveDisputeInput = DisputeOutcomeInput & { note: string };
export type { ModerationDisputeRow, ModerationDisputeSheet };

export interface ModerationDisputeFilters {
	status?: Dispute["status"];
	reason?: Dispute["reason"];
	paymentMethod?: Dispute["paymentMethod"];
	overdue?: boolean;
	assignedTo?: string;
}

const OPEN_STATUSES = [
	"open",
	"awaiting_seller",
	"awaiting_buyer",
	"under_review",
];

function proofFor(reason: Dispute["reason"], order: Order) {
	return proofChecklist(reason, {
		otpVerified: Boolean(order.handover?.verifiedAt),
		podDistanceMeters: null,
		podPhotoIntact: false,
		preShipmentPhotos: false,
		packingBeforeShipment: false,
		snapshotMatch: false,
		brandAuthorisation: false,
		attemptProof: false,
		rescheduleAccepted: false,
	});
}

async function loadDispute(
	payload: Payload,
	id: string,
	req?: PayloadRequest,
): Promise<Dispute> {
	return payload.findByID({
		collection: "disputes",
		id,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
}

export async function resolveDispute(
	payload: Payload,
	actor: Actor,
	disputeId: string,
	input: ResolveDisputeInput,
	now = new Date(),
): Promise<Dispute> {
	assertModerator(actor);
	return withTransaction(
		payload,
		async (req) => {
			const dispute = await loadDispute(req.payload, disputeId, req);
			const orderId = relationId(dispute.order);
			if (!orderId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
			const order = await req.payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const shopId = relationId(dispute.shop);
			if (
				relationId(dispute.buyer) === actor.id ||
				(shopId &&
					(await resolveShopRole(req.payload, actor.id, shopId, req.context)))
			) {
				throw new ModerationError(ERROR_CODES.moderationForbidden, 403);
			}
			if (dispute.status !== "under_review") {
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			}
			const maximum = Number(dispute.amountAtStake ?? 0);
			if (
				!Number.isSafeInteger(input.refundAmount) ||
				input.refundAmount < 0 ||
				input.refundAmount > maximum ||
				(input.outcome === "resolved_buyer" && input.refundAmount <= 0) ||
				(input.outcome === "resolved_seller" && input.refundAmount !== 0) ||
				(input.outcome === "resolved_split" &&
					(input.refundAmount <= 0 || input.refundAmount >= maximum))
			) {
				throw new ModerationError(ERROR_CODES.disputeRefundExceedsOrder, 400);
			}
			const settings = await getDisputeSettings(req.payload);
			if (
				input.refundAmount > settings.moderatorRefundLimit &&
				!isAdmin(actor)
			) {
				throw new ModerationError(ERROR_CODES.moderationRankTooLow, 403);
			}
			const checklist = proofFor(dispute.reason, order);
			if (
				input.outcome === "resolved_seller" &&
				!resolvedSellerNeedsOverride(
					checklist,
					input.reasonCode,
					input.note.trim(),
				)
			) {
				throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
			}
			const openHold = shopId
				? await findActiveHold(req, {
						scope: "order",
						shop: shopId,
						order: orderId,
						reason: "dispute_open",
					})
				: null;
			const decided = await applyOutcome(
				req,
				dispute,
				input,
				"moderator",
				actor.id,
				now,
			);
			const refundCaseId = relationId(decided.effects?.returnCase);
			const refundId = relationId(decided.effects?.refund);
			await writeLog(
				req.payload,
				{
					actor,
					action: "dispute.resolve",
					targetType: "dispute",
					targetId: disputeId,
					reason: input.reasonCode,
					note: input.note.trim(),
					metadata: {
						outcome: input.outcome,
						refundAmount: input.refundAmount,
						breakdown: decided.resolution?.breakdown ?? null,
						returnRequired: input.returnRequired,
						returnShippingPaidBy: input.returnShippingPaidBy,
						liableParty: input.liableParty,
						paymentMethod: dispute.paymentMethod,
						returnCaseId: refundCaseId,
						refundId,
						creditNoteId: null,
						strikeIds: decided.effects?.strikes ?? [],
						holdIdsReleased:
							decided.effects?.holdsReleased && openHold
								? [String(openHold.id)]
								: [],
						riskSignalIds: decided.effects?.riskSignals ?? [],
						reviewAction: decided.effects?.reviewAction ?? "none",
						proofChecklist: checklist,
					},
				},
				req,
			);
			return decided;
		},
		{ user: actor },
	);
}

export async function requestDisputeInfo(
	payload: Payload,
	actor: Actor,
	disputeId: string,
	input: { from: "buyer" | "seller"; message: string },
	now = new Date(),
): Promise<Dispute> {
	assertModerator(actor);
	const message = input.message.trim();
	if (!message || message.length > 2000) {
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	}
	return withTransaction(
		payload,
		async (req) => {
			const dispute = await loadDispute(req.payload, disputeId, req);
			if (dispute.status !== "under_review") {
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			}
			const settings = await getDisputeSettings(req.payload);
			const requests = Number(dispute.infoRequests ?? 0);
			if (requests >= settings.maxInfoRequests) {
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			}
			const moved = await moveDispute(
				req,
				dispute,
				input.from === "buyer" ? "awaiting_buyer" : "awaiting_seller",
				{
					type: "moderator",
					id: actor.id,
					at: now,
					note: "More information requested.",
				},
			);
			await req.payload.create({
				collection: "dispute-messages",
				req,
				overrideAccess: true,
				data: {
					dispute: disputeId,
					author: actor.id,
					authorType: "moderator",
					kind: "info_request",
					body: message,
					visibility: "parties",
				},
			});
			const updated = await req.payload.update({
				collection: "disputes",
				id: disputeId,
				req,
				overrideAccess: true,
				data: {
					infoRequests: requests + 1,
					deadlines: {
						...moved.deadlines,
						respondBy: new Date(
							now.getTime() + settings.respondHours * 3_600_000,
						).toISOString(),
					},
				},
			});
			await writeLog(
				req.payload,
				{
					actor,
					action: "dispute.request_info",
					targetType: "dispute",
					targetId: disputeId,
					note: message,
					metadata: { from: input.from, infoRequests: requests + 1 },
				},
				req,
			);
			const notify = () => notifyDisputeInfoRequested(req, updated);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return updated;
		},
		{ user: actor },
	);
}

export async function previewDisputeOutcome(
	payload: Payload,
	disputeId: string,
	refundAmount: number,
): Promise<DisputeOutcomePreview> {
	const dispute = await loadDispute(payload, disputeId);
	const orderId = relationId(dispute.order);
	if (!orderId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	const order = await payload.findByID({
		collection: "orders",
		id: orderId,
		depth: 0,
		overrideAccess: true,
	});
	return {
		refundAmount,
		breakdown: splitAllocation({
			refundAmount,
			goods: Number(order.amounts?.subtotal ?? 0),
			orderDeliveryFee: Number(
				order.amounts?.deliveryFee ?? order.delivery.fee ?? 0,
			),
		}),
	};
}

export async function getModerationDisputeSheet(
	payload: Payload,
	actor: Actor,
	disputeId: string,
): Promise<ModerationDisputeSheet> {
	assertModerator(actor);
	const dispute = await loadDispute(payload, disputeId);
	const view = await getDisputeView(payload, actor, disputeId);
	const orderId = relationId(dispute.order);
	const shopId = relationId(dispute.shop);
	const buyerId = relationId(dispute.buyer);
	if (!orderId || !shopId || !buyerId)
		throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	const [order, buyerDisputes, shopDisputes, standing, settings] =
		await Promise.all([
			payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
			}),
			payload.find({
				collection: "disputes",
				where: {
					and: [
						{ buyer: { equals: buyerId } },
						{
							createdAt: {
								greater_than_equal: new Date(
									Date.now() - 365 * 86_400_000,
								).toISOString(),
							},
						},
					],
				},
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			}),
			payload.find({
				collection: "disputes",
				where: { shop: { equals: shopId } },
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			}),
			shopStanding(payload, shopId),
			getDisputeSettings(payload),
		]);
	const closedShopDisputes = shopDisputes.docs.filter((row) =>
		["resolved_buyer", "resolved_seller", "resolved_split"].includes(
			row.status ?? "",
		),
	);
	const losses = closedShopDisputes.filter((row) =>
		["resolved_buyer", "resolved_split"].includes(row.status ?? ""),
	).length;
	return {
		dispute: view,
		proofChecklist: proofFor(dispute.reason, order),
		refundable: Number(dispute.amountAtStake ?? 0),
		components: {
			goods: Number(order.amounts?.subtotal ?? 0),
			outboundDelivery: Number(order.amounts?.deliveryFee ?? 0),
			buyerProtectionFee: Number(order.amounts?.buyerProtectionFee ?? 0),
		},
		partyHistory: {
			buyerRefusalScore: Number(order.risk?.refusalsAtPlacement ?? 0),
			buyerDisputes12m: buyerDisputes.docs.length,
			shopStanding: standing,
			shopDisputeLossRate: closedShopDisputes.length
				? losses / closedShopDisputes.length
				: null,
		},
		resale:
			dispute.resale?.supplierShop && dispute.resale.resellerShop
				? {
						supplierShopId: relationId(dispute.resale.supplierShop) ?? "",
						resellerShopId: relationId(dispute.resale.resellerShop) ?? "",
						purchaseOrder: dispute.resale.purchaseOrder ?? null,
					}
				: null,
		moderatorRefundLimit: settings.moderatorRefundLimit,
	};
}

export async function assignDispute(
	payload: Payload,
	actor: Actor,
	disputeId: string,
): Promise<Dispute> {
	assertModerator(actor);
	return withTransaction(payload, async (req) => {
		const dispute = await loadDispute(req.payload, disputeId, req);
		if (
			!OPEN_STATUSES.includes(dispute.status as (typeof OPEN_STATUSES)[number])
		)
			throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
		const updated = await req.payload.update({
			collection: "disputes",
			id: disputeId,
			req,
			overrideAccess: true,
			data: { assignedTo: actor.id },
		});
		await writeLog(
			req.payload,
			{
				actor,
				action: "dispute.assign",
				targetType: "dispute",
				targetId: disputeId,
				metadata: { assignedTo: actor.id },
			},
			req,
		);
		return updated;
	});
}

export async function redactDisputeMessage(
	payload: Payload,
	actor: Actor,
	disputeId: string,
	messageId: string,
	note: string,
): Promise<void> {
	assertModerator(actor);
	const trimmed = note.trim();
	if (trimmed.length < 10 || trimmed.length > 2000)
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	await withTransaction(payload, async (req) => {
		const message = await req.payload.findByID({
			collection: "dispute-messages",
			id: messageId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (relationId(message.dispute) !== disputeId)
			throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 404);
		if (message.redactedAt) return;
		await req.payload.update({
			collection: "dispute-messages",
			id: messageId,
			req,
			overrideAccess: true,
			data: {
				body: null,
				redactedAt: new Date().toISOString(),
				redactedBy: actor.id,
			},
		});
		await writeLog(
			req.payload,
			{
				actor,
				action: "dispute.redact_message",
				targetType: "dispute",
				targetId: disputeId,
				note: trimmed,
				metadata: { messageId, originalBody: message.body ?? null },
			},
			req,
		);
	});
}

export async function revokeDisputeStrike(
	payload: Payload,
	actor: Actor,
	strikeId: string,
	note: string,
): Promise<void> {
	if (!isAdmin(actor))
		throw new ModerationError(ERROR_CODES.moderationRankTooLow, 403);
	const trimmed = note.trim();
	if (trimmed.length < 10 || trimmed.length > 2000)
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	await withTransaction(payload, async (req) => {
		const strike = await req.payload.findByID({
			collection: "shop-strikes",
			id: strikeId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		await revokeStrikeRow(req, strikeId, {
			revokedBy: actor.id,
			note: trimmed,
		});
		await writeLog(
			req.payload,
			{
				actor,
				action: "strike.revoke",
				targetType: "dispute",
				targetId: strike.sourceType === "dispute" ? strike.sourceId : strikeId,
				note: trimmed,
				metadata: { strikeId, shopId: relationId(strike.shop) },
			},
			req,
		);
	});
}

export async function listModerationDisputes(
	payload: Payload,
	filters: ModerationDisputeFilters = {},
	now = new Date(),
): Promise<ModerationDisputeRow[]> {
	const statuses = filters.status
		? [filters.status]
		: ["open", "awaiting_seller", "awaiting_buyer", "under_review"];
	const conditions: Where[] = [{ status: { in: statuses } }];
	if (filters.reason) conditions.push({ reason: { equals: filters.reason } });
	if (filters.paymentMethod)
		conditions.push({ paymentMethod: { equals: filters.paymentMethod } });
	if (filters.assignedTo)
		conditions.push({ assignedTo: { equals: filters.assignedTo } });
	const found = await payload.find({
		collection: "disputes",
		where: { and: conditions },
		limit: 200,
		depth: 0,
		overrideAccess: true,
	});
	const rows = await Promise.all(
		found.docs.map(async (dispute): Promise<ModerationDisputeRow> => {
			const deadline =
				dispute.status === "under_review"
					? dispute.deadlines?.reviewDueAt
					: (dispute.deadlines?.respondBy ?? dispute.deadlines?.submitBy);
			const orderId = relationId(dispute.order);
			const orderNumber = orderId
				? await payload
						.findByID({
							collection: "orders",
							id: orderId,
							depth: 0,
							overrideAccess: true,
						})
						.then((order) => order.orderNumber)
						.catch(() => "")
				: "";
			return {
				id: String(dispute.id),
				number: dispute.number,
				orderId,
				orderNumber,
				shopId: relationId(dispute.shop),
				buyerId: relationId(dispute.buyer),
				reason: dispute.reason,
				subject: dispute.subject,
				paymentMethod: dispute.paymentMethod,
				status: dispute.status,
				amountAtStake: Number(dispute.amountAtStake ?? 0),
				deadline: deadline ?? null,
				overdue: Boolean(deadline && Date.parse(deadline) < now.getTime()),
				assignedTo: relationId(dispute.assignedTo),
				ageDays: Math.max(
					0,
					Math.floor(
						(now.getTime() - Date.parse(dispute.createdAt)) / 86_400_000,
					),
				),
			};
		}),
	);
	return rows
		.filter((row) =>
			filters.overdue === undefined
				? true
				: Boolean(row.deadline && Date.parse(row.deadline) < now.getTime()) ===
					filters.overdue,
		)
		.sort((a, b) => {
			if (!a.deadline) return 1;
			if (!b.deadline) return -1;
			return Date.parse(a.deadline) - Date.parse(b.deadline);
		});
}
