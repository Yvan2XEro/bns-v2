import type { Payload, PayloadRequest } from "payload";
import { can, resolveShopRole } from "../access/shopRoles";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { Dispute, Order, Refund, ReturnCase } from "../payload-types";
import {
	notifyDisputeOpened,
	notifyRefundOverdue,
	notifyRefundProofSubmitted,
} from "./caseNotifications";
import { openRefundContestDispute } from "./disputes";
import { applyReservedTransition } from "./orders/transitions";
import { findActiveHold, releaseHold } from "./payoutHolds";
import { requestRefund } from "./refunds";
import { adjustResellerCommissionForRefund } from "./purchaseOrders";
import { moveCase } from "./returns";
import type { ServiceUser } from "./shops";

type SellerRefundMethod = NonNullable<
	NonNullable<ReturnCase["refund"]>["sellerProof"]
>["method"];

export interface RefundProofInput {
	method: SellerRefundMethod;
	transactionId?: string;
	amount: number;
	evidenceIds: string[];
}

function reasonFor(kase: ReturnCase): "withdrawal" | "unavailable" | "dispute" {
	if (kase.basis === "withdrawal") return "withdrawal";
	if (kase.basis === "unavailable") return "unavailable";
	return "dispute";
}

async function orderForCase(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<Order> {
	const orderId = relationId(kase.order);
	if (!orderId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	return req.payload.findByID({
		collection: "orders",
		id: orderId,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

/** Creates one provider refund row; P5 owns the ledger and provider submission. */
export async function executeRefund(
	req: PayloadRequest,
	kase: ReturnCase,
): Promise<Refund | null> {
	if (kase.status !== "refund_pending") {
		throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
	}
	const order = await orderForCase(req, kase);
	await adjustResellerCommissionForRefund(
		req,
		String(order.id),
		Number(kase.refund?.amount ?? 0),
		"return",
		String(kase.id),
	);
	if (kase.refund?.channel === "seller_direct") return null;
	if (order.paymentMethod === "cod") {
		await req.payload.update({
			collection: "return-cases",
			id: String(kase.id),
			req,
			overrideAccess: true,
			data: { refund: { ...kase.refund, channel: "seller_direct" } },
		});
		return null;
	}
	const existingRefundId = relationId(kase.refund?.providerRefund);
	if (existingRefundId) {
		return req.payload.findByID({
			collection: "refunds",
			id: existingRefundId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	}
	let refund: Refund;
	try {
		refund = await requestRefund(req, {
			order: String(order.id),
			amount: Number(kase.refund?.amount ?? 0),
			reason: reasonFor(kase),
			sourceType: "return-case",
			sourceId: String(kase.id),
		});
	} catch (error) {
		if (
			error instanceof ServiceError &&
			error.code === ERROR_CODES.refundWindowExpired
		) {
			await req.payload.update({
				collection: "return-cases",
				id: String(kase.id),
				req,
				overrideAccess: true,
				data: { refund: { ...kase.refund, channel: "seller_direct" } },
			});
			return null;
		}
		throw error;
	}
	await req.payload.update({
		collection: "return-cases",
		id: String(kase.id),
		req,
		overrideAccess: true,
		data: {
			refund: {
				...kase.refund,
				channel: "provider",
				providerRefund: refund.id,
			},
		},
	});
	return refund;
}

async function activeOrderDispute(
	req: PayloadRequest,
	orderId: string,
): Promise<Dispute | null> {
	const result = await req.payload.find({
		collection: "disputes",
		where: {
			and: [
				{ order: { equals: orderId } },
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
	return result.docs[0] ?? null;
}

async function finishReturnRefund(
	req: PayloadRequest,
	kase: ReturnCase,
	actorType: "buyer" | "system",
	actorId?: string,
	now = new Date(),
): Promise<ReturnCase> {
	const refunded =
		kase.status === "refund_pending"
			? await moveCase(req, kase, "refunded", {
					actorType,
					actor: actorId,
					at: now,
				})
			: kase;
	const closed = await moveCase(req, refunded, "closed", {
		actorType,
		actor: actorId,
		at: now,
	});
	const persisted = await req.payload.update({
		collection: "return-cases",
		id: String(kase.id),
		req,
		overrideAccess: true,
		data: {
			closedAt: now.toISOString(),
			refund: {
				...closed.refund,
				...(actorType === "buyer"
					? { buyerConfirmedAt: now.toISOString() }
					: {}),
			},
		},
	});
	const order = await orderForCase(req, kase);
	const orderId = String(order.id);
	const [activeCases, dispute, hold] = await Promise.all([
		req.payload.find({
			collection: "return-cases",
			where: {
				and: [
					{ order: { equals: orderId } },
					{ id: { not_equals: String(kase.id) } },
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
		}),
		activeOrderDispute(req, orderId),
		findActiveHold(req, {
			scope: "order",
			shop: relationId(order.shop) ?? "",
			order: orderId,
			reason: "return_open",
		}),
	]);
	const nextCase = activeCases.docs[0];
	await applyReservedTransition(
		req,
		order,
		{
			set: {
				completionHold: dispute ? "dispute" : nextCase ? "return_case" : "none",
				returnCase: nextCase ? String(nextCase.id) : null,
			},
		},
		{
			type: "order.return_refunded",
			actorType,
			...(actorId ? { actor: actorId } : {}),
			visibility: "both",
			metadata: { caseId: String(kase.id), activeDispute: Boolean(dispute) },
		},
	);
	if (!nextCase && hold) {
		await releaseHold(req, String(hold.id), {
			releasedBy: actorId,
			note: "Return refund completed.",
		});
	}
	return persisted;
}

export async function submitRefundProof(
	payload: Payload,
	member: ServiceUser,
	caseId: string,
	input: RefundProofInput,
): Promise<ReturnCase> {
	return withTransaction(
		payload,
		async (req) => {
			const kase = await req.payload.findByID({
				collection: "return-cases",
				id: caseId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const shopId = relationId(kase.shop);
			const role = await resolveShopRole(
				req.payload,
				member.id,
				shopId,
				req.context,
			);
			if (!role) throw new ServiceError(ERROR_CODES.notFound, 404);
			if (!can(role, "orders.process") || role === "staff") {
				throw new ServiceError(ERROR_CODES.forbidden, 403);
			}
			if (
				kase.status !== "refund_pending" ||
				kase.refund?.channel !== "seller_direct"
			) {
				throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
			}
			if (
				!Number.isSafeInteger(input.amount) ||
				input.amount < Number(kase.refund.amount ?? 0) ||
				input.evidenceIds.length === 0 ||
				((input.method === "mtn_momo" || input.method === "orange_money") &&
					!input.transactionId?.trim())
			) {
				throw new ServiceError(ERROR_CODES.returnRefundProofInvalid, 400);
			}
			const evidenceIds = [...new Set(input.evidenceIds)];
			const evidence = await req.payload.find({
				collection: "dispute-evidence",
				where: {
					and: [
						{ id: { in: evidenceIds } },
						{ returnCase: { equals: caseId } },
						{ uploadedBy: { equals: member.id } },
						{ kind: { equals: "payment_proof" } },
					],
				},
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (evidence.docs.length !== evidenceIds.length) {
				throw new ServiceError(ERROR_CODES.returnRefundProofInvalid, 400);
			}
			const updated = await req.payload.update({
				collection: "return-cases",
				id: caseId,
				req,
				overrideAccess: true,
				data: {
					refund: {
						...kase.refund,
						sellerProof: {
							method: input.method,
							transactionId: input.transactionId?.trim() || null,
							amount: input.amount,
							evidence: evidenceIds[0],
							submittedAt: new Date().toISOString(),
						},
					},
				},
			});
			const notify = () => notifyRefundProofSubmitted(req, updated);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return updated;
		},
		{ user: member },
	);
}

export async function confirmRefund(
	payload: Payload,
	buyer: ServiceUser,
	caseId: string,
): Promise<ReturnCase> {
	return withTransaction(
		payload,
		async (req) => {
			const kase = await req.payload.findByID({
				collection: "return-cases",
				id: caseId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (relationId(kase.buyer) !== buyer.id) {
				throw new ServiceError(ERROR_CODES.notFound, 404);
			}
			if (
				kase.status !== "refund_pending" ||
				!kase.refund?.sellerProof?.evidence
			) {
				throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
			}
			return finishReturnRefund(req, kase, "buyer", buyer.id);
		},
		{ user: buyer },
	);
}

export async function contestRefund(
	payload: Payload,
	buyer: ServiceUser,
	caseId: string,
	now = new Date(),
): Promise<{ kase: ReturnCase; dispute: Dispute }> {
	return withTransaction(
		payload,
		async (req) => {
			const kase = await req.payload.findByID({
				collection: "return-cases",
				id: caseId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (relationId(kase.buyer) !== buyer.id) {
				throw new ServiceError(ERROR_CODES.notFound, 404);
			}
			if (
				kase.status !== "refund_pending" ||
				!kase.refund?.sellerProof?.evidence ||
				kase.refund.contestedAt
			) {
				throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
			}
			const dispute = await openRefundContestDispute(req, kase, buyer, now);
			const contested = await moveCase(req, kase, "disputed", {
				actorType: "buyer",
				actor: buyer.id,
				at: now,
				note: `Refund contested; dispute ${dispute.number} opened.`,
			});
			const updated = await req.payload.update({
				collection: "return-cases",
				id: caseId,
				req,
				overrideAccess: true,
				data: {
					refund: { ...contested.refund, contestedAt: now.toISOString() },
					dispute: String(dispute.id),
				},
			});
			const notify = () => notifyDisputeOpened(req, dispute);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return { kase: updated, dispute };
		},
		{ user: buyer },
	);
}

export async function advanceReturnRefunds(
	payload: Payload,
	now = new Date(),
): Promise<{ executed: string[]; closed: string[] }> {
	const pending = await payload.find({
		collection: "return-cases",
		where: { status: { equals: "refund_pending" } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const executed: string[] = [];
	const closed: string[] = [];
	for (const candidate of pending.docs) {
		const id = String(candidate.id);
		const result = await withTransaction(payload, async (req) => {
			const kase = await req.payload.findByID({
				collection: "return-cases",
				id,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (kase.status !== "refund_pending") return "none";
			if (
				kase.deadlines?.refundBy &&
				Date.parse(kase.deadlines.refundBy) <= now.getTime() &&
				!kase.deadlines.refundOverdueNotifiedAt
			) {
				await req.payload.update({
					collection: "return-cases",
					id,
					req,
					overrideAccess: true,
					data: {
						deadlines: {
							...kase.deadlines,
							refundOverdueNotifiedAt: now.toISOString(),
						},
					},
				});
				const notify = () => notifyRefundOverdue(req, kase);
				if (!onCommit(commitContextOf(req), notify)) await notify();
			}
			if (!kase.refund?.channel || !kase.refund.providerRefund) {
				const refund = await executeRefund(req, kase);
				return refund ? "executed" : "none";
			}
			const refund = await req.payload
				.findByID({
					collection: "refunds",
					id: relationId(kase.refund.providerRefund) ?? "",
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (refund?.status !== "succeeded") return "none";
			await finishReturnRefund(req, kase, "system", undefined, now);
			return "closed";
		});
		if (result === "executed") executed.push(id);
		if (result === "closed") closed.push(id);
	}
	return { executed, closed };
}
