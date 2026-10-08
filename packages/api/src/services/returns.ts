import type { Payload, PayloadRequest, Where } from "payload";
import type {
	InspectReturnItemInput,
	OpenWithdrawalInput,
	ReturnAction,
	ReturnCaseStatus,
	ReturnCaseView,
	ReturnItemInput,
	ReturnListRow,
	ShipReturnInput,
} from "../contracts/returns";

export type {
	InspectReturnItemInput,
	OpenWithdrawalInput,
	ReturnAction,
	ReturnCaseStatus,
	ReturnCaseView,
	ReturnItemInput,
	ReturnListRow,
	ShipReturnInput,
} from "../contracts/returns";

import { type OrderViewer, requireOrderAudience } from "../access/orderAccess";
import { can, resolveShopRole } from "../access/shopRoles";
import { RETURN_CASE_STATUSES } from "../collections/ReturnCases";
import { caseBreakdown, deductionAllowed } from "../lib/caseMath";
import { getDisputeSettings, getReturnSettings } from "../lib/caseSettings";
import { ERROR_CODES } from "../lib/errors";
import { getOrderSettings } from "../lib/orderSettings";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { OrderItem, ReturnCase } from "../payload-types";
import {
	notifyDisputeOpened,
	notifyReturnInspected,
	notifyReturnInstructions,
	notifyReturnReceived,
	notifyReturnRequested,
} from "./caseNotifications";
import { openDeductionDispute } from "./disputes";
import { applyReservedTransition } from "./orders/transitions";
import { createHold, findActiveHold, releaseHold } from "./payoutHolds";
import { nextNumber } from "./sequences";
import { findShop, requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";
import { applyMovement } from "./stock";

export const RETURN_TRANSITIONS: Record<
	ReturnCaseStatus,
	readonly ReturnCaseStatus[]
> = {
	requested: ["approved", "rejected", "cancelled"],
	approved: ["awaiting_shipment", "refund_pending"],
	rejected: [],
	cancelled: [],
	awaiting_shipment: ["in_transit", "expired", "cancelled", "refund_pending"],
	in_transit: ["received"],
	received: ["inspected"],
	inspected: ["refund_pending", "disputed"],
	disputed: ["closed"],
	refund_pending: ["refunded", "disputed"],
	refunded: ["closed"],
	closed: [],
	expired: [],
};

export function assertReturnTransition(
	from: ReturnCaseStatus,
	to: ReturnCaseStatus,
): void {
	if (!RETURN_TRANSITIONS[from].includes(to)) {
		throw new ServiceError(
			ERROR_CODES.returnInvalidTransition,
			409,
			`cannot move return case from "${from}" to "${to}"`,
		);
	}
}

export interface MoveReturnCaseOptions {
	actorType: NonNullable<ReturnCase["openedByType"]>;
	actor?: string;
	note?: string;
	at?: Date;
}

/** The single writer for return-case status and its append-only history. */
export async function moveCase(
	req: PayloadRequest,
	kase: ReturnCase,
	to: ReturnCaseStatus,
	options: MoveReturnCaseOptions,
): Promise<ReturnCase> {
	assertReturnTransition(kase.status, to);
	const updated = await req.payload.update({
		collection: "return-cases",
		where: {
			and: [
				{ id: { equals: String(kase.id) } },
				{ status: { equals: kase.status } },
			],
		},
		req,
		overrideAccess: true,
		data: {
			status: to,
			statusHistory: [
				...(kase.statusHistory ?? []),
				{
					status: to,
					actorType: options.actorType,
					actor: options.actor,
					at: (options.at ?? new Date()).toISOString(),
					note: options.note,
				},
			],
		},
	});
	const result = updated.docs[0];
	if (result) return result;
	throw new ServiceError(
		ERROR_CODES.returnInvalidTransition,
		409,
		"return case changed while applying the transition",
	);
}

export const RETURN_CASE_STATUS_NAMES = RETURN_CASE_STATUSES;

async function loadCase(
	req: PayloadRequest,
	caseId: string,
): Promise<ReturnCase> {
	try {
		return await req.payload.findByID({
			collection: "return-cases",
			id: caseId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
}

function returnActions(
	kase: ReturnCase,
	audience: Awaited<ReturnType<typeof requireOrderAudience>>["audience"],
): ReturnAction[] {
	const actions: ReturnAction[] = [];
	if (audience.kind === "buyer") {
		if (
			kase.status === "awaiting_shipment" &&
			kase.returnMethod !== "seller_pickup"
		)
			actions.push("ship");
		if (["requested", "approved", "awaiting_shipment"].includes(kase.status))
			actions.push("cancel");
		if (
			kase.status === "inspected" &&
			(kase.items ?? []).some(
				(item) => Number(item.inspection?.deductionAmount ?? 0) > 0,
			)
		)
			actions.push("accept_deduction", "contest_deduction");
		if (
			kase.status === "refund_pending" &&
			kase.refund?.sellerProof?.evidence
		) {
			actions.push("confirm_refund");
			if (!kase.refund.contestedAt) actions.push("contest_refund");
		}
		if (
			[
				"requested",
				"approved",
				"awaiting_shipment",
				"in_transit",
				"received",
				"inspected",
				"refund_pending",
				"disputed",
			].includes(kase.status)
		)
			actions.push("upload_evidence");
	}
	if (audience.kind === "shop") {
		if (
			kase.status === "awaiting_shipment" &&
			kase.returnMethod === "seller_pickup"
		)
			actions.push("pickup");
		if (kase.status === "in_transit") actions.push("receive");
		if (kase.status === "received") actions.push("inspect");
		if (
			kase.status === "refund_pending" &&
			kase.refund?.channel === "seller_direct" &&
			audience.role !== "staff"
		)
			actions.push("refund_proof");
		if (
			[
				"requested",
				"approved",
				"awaiting_shipment",
				"in_transit",
				"received",
				"inspected",
				"refund_pending",
				"disputed",
			].includes(kase.status)
		)
			actions.push("upload_evidence");
	}
	if (
		audience.kind === "staff" &&
		[
			"requested",
			"approved",
			"awaiting_shipment",
			"in_transit",
			"received",
			"inspected",
			"refund_pending",
			"disputed",
		].includes(kase.status)
	)
		actions.push("upload_evidence");
	return actions;
}

/** Projects only case facts the order audience is allowed to see. */
export async function getReturnCaseView(
	payload: Payload,
	viewer: OrderViewer,
	caseId: string,
): Promise<ReturnCaseView> {
	let kase: ReturnCase;
	try {
		kase = await payload.findByID({
			collection: "return-cases",
			id: caseId,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	const orderId = relationId(kase.order);
	if (!orderId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	const { order, audience } = await requireOrderAudience(
		payload,
		viewer,
		orderId,
	);
	const items = await Promise.all(
		(kase.items ?? []).map(async (entry) => {
			const orderItemId = relationId(entry.orderItem);
			if (!orderItemId)
				throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
			const item: OrderItem = await payload.findByID({
				collection: "order-items",
				id: orderItemId,
				depth: 0,
				overrideAccess: true,
			});
			return {
				orderItemId,
				title: item.snapshot?.title ?? "",
				quantity: Number(entry.quantity ?? 0),
				unitPrice: Number(entry.unitPrice ?? 0),
				buyerCondition: entry.buyerCondition ?? null,
				inspection: entry.inspection?.outcome
					? {
							outcome: entry.inspection.outcome,
							deductionAmount: Number(entry.inspection.deductionAmount ?? 0),
							note: entry.inspection.note ?? null,
						}
					: null,
			};
		}),
	);
	const refund = kase.refund;
	const refundId = relationId(refund?.providerRefund);
	const providerRefundStatus = refundId
		? (
				await payload.findByID({
					collection: "refunds",
					id: refundId,
					depth: 0,
					overrideAccess: true,
				})
			).status
		: null;
	const proof = refund?.sellerProof;
	return {
		id: String(kase.id),
		number: kase.number,
		orderId,
		orderNumber: order.orderNumber,
		basis: kase.basis,
		status: kase.status,
		returnRequired: kase.returnRequired !== false,
		returnMethod: kase.returnMethod ?? null,
		returnTracking: kase.returnTracking ?? null,
		items,
		reasonText: kase.reasonText ?? null,
		deadlines: {
			requestDeadline: kase.deadlines?.requestDeadline ?? null,
			shipBy: kase.deadlines?.shipBy ?? null,
			pickupBy: kase.deadlines?.pickupBy ?? null,
			inspectBy: kase.deadlines?.inspectBy ?? null,
			deductionRespondBy: kase.deadlines?.deductionRespondBy ?? null,
			refundBy: kase.deadlines?.refundBy ?? null,
		},
		returnShippingPaidBy:
			Number(refund?.breakdown?.returnShipping ?? 0) > 0 ||
			kase.basis !== "withdrawal"
				? "seller"
				: "buyer",
		refund: {
			amount: Number(refund?.amount ?? 0),
			breakdown: {
				goods: Number(refund?.breakdown?.goods ?? 0),
				outboundDelivery: Number(refund?.breakdown?.outboundDelivery ?? 0),
				returnShipping: Number(refund?.breakdown?.returnShipping ?? 0),
				buyerProtectionFee: Number(refund?.breakdown?.buyerProtectionFee ?? 0),
				deduction: Number(refund?.breakdown?.deduction ?? 0),
			},
			channel: refund?.channel ?? null,
			providerRefundStatus,
			sellerProof:
				proof?.method && proof.submittedAt
					? {
							method: proof.method,
							transactionId: proof.transactionId ?? null,
							amount: Number(proof.amount ?? 0),
							submittedAt: proof.submittedAt,
						}
					: null,
			buyerConfirmedAt: refund?.buyerConfirmedAt ?? null,
			contestedAt: refund?.contestedAt ?? null,
		},
		disputeId: relationId(kase.dispute),
		rejectionReason: kase.rejectionReason ?? null,
		timeline: (kase.statusHistory ?? []).map((entry) => ({
			status: entry.status ?? "",
			actorType:
				entry.actorType === "buyer" || entry.actorType === "seller"
					? entry.actorType
					: "system",
			at: entry.at ?? "",
			note: entry.note ?? null,
		})),
		allowedActions: returnActions(kase, audience),
	};
}

export async function listReturnCases(
	payload: Payload,
	viewer: ServiceUser,
	options: {
		shopId?: string;
		status?: ReturnCaseStatus;
		overdue?: boolean;
	} = {},
	now = new Date(),
): Promise<{ rows: ReturnListRow[]; awaitingCount: number }> {
	const buyerView = options.shopId === undefined;
	const clauses: Where[] = [];
	if (buyerView) {
		clauses.push({ buyer: { equals: viewer.id } });
	} else {
		const shopId = options.shopId;
		if (!shopId) throw new ServiceError(ERROR_CODES.shopNotFound, 404);
		await requireShopPermission(payload, viewer, shopId, "orders.view");
		clauses.push({ shop: { equals: shopId } });
	}
	if (options.status) clauses.push({ status: { equals: options.status } });
	const result = await payload.find({
		collection: "return-cases",
		where: { and: clauses },
		limit: 100,
		sort: "-createdAt",
		depth: 0,
		overrideAccess: true,
	});
	const projectedRows = await Promise.all(
		result.docs.map(async (kase): Promise<ReturnListRow> => {
			const order = await payload.findByID({
				collection: "orders",
				id: relationId(kase.order) ?? "",
				depth: 0,
				overrideAccess: true,
			});
			const candidates = buyerView
				? [kase.deadlines?.shipBy, kase.deadlines?.refundBy]
				: [
						kase.deadlines?.pickupBy,
						kase.deadlines?.shipBy,
						kase.deadlines?.inspectBy,
						kase.deadlines?.refundBy,
					];
			const nextDeadline =
				candidates
					.filter((value): value is string => typeof value === "string")
					.sort((left, right) => Date.parse(left) - Date.parse(right))[0] ??
				null;
			return {
				id: String(kase.id),
				number: kase.number,
				orderNumber: order.orderNumber,
				basis: kase.basis,
				status: kase.status,
				refundAmount: Number(kase.refund?.amount ?? 0),
				nextDeadline,
				overdue:
					nextDeadline !== null && Date.parse(nextDeadline) <= now.getTime(),
				createdAt: kase.createdAt,
			};
		}),
	);
	const rows = options.overdue
		? projectedRows.filter((row) => row.overdue)
		: projectedRows;
	const awaitingStatuses = buyerView
		? new Set<ReturnCaseStatus>([
				"awaiting_shipment",
				"inspected",
				"refund_pending",
			])
		: new Set<ReturnCaseStatus>(["in_transit", "received", "refund_pending"]);
	return {
		rows,
		awaitingCount: rows.filter((row) => awaitingStatuses.has(row.status))
			.length,
	};
}

function requireBuyer(kase: ReturnCase, user: ServiceUser): void {
	if (relationId(kase.buyer) !== user.id) {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
}

async function requireReturnShopRole(
	req: PayloadRequest,
	kase: ReturnCase,
	user: ServiceUser,
	ownerOnly = false,
): Promise<void> {
	const shopId = relationId(kase.shop);
	if (!shopId) throw new ServiceError(ERROR_CODES.notFound, 404);
	await findShop(req.payload, shopId, req);
	const role = await resolveShopRole(req.payload, user.id, shopId, req.context);
	if (!role) throw new ServiceError(ERROR_CODES.notFound, 404);
	if ((ownerOnly && role === "staff") || !can(role, "orders.process")) {
		throw new ServiceError(ERROR_CODES.forbidden, 403);
	}
}

function daysAfter(now: Date, days: number): string {
	return new Date(now.getTime() + days * DAY_MS).toISOString();
}

async function reconcileCancelledReturn(
	req: PayloadRequest,
	kase: ReturnCase,
	actorId: string | undefined,
	terminal: "cancelled" | "expired" = "cancelled",
): Promise<void> {
	const orderId = relationId(kase.order);
	const shopId = relationId(kase.shop);
	if (!orderId || !shopId)
		throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	const [otherCases, disputes, order, hold] = await Promise.all([
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
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		}),
		req.payload.find({
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
		}),
		req.payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
			req,
		}),
		findActiveHold(req, {
			scope: "order",
			shop: shopId,
			order: orderId,
			reason: "return_open",
		}),
	]);
	const activeCase = otherCases.docs[0];
	const hasDispute = disputes.docs.length > 0;
	const items = await req.payload.find({
		collection: "order-items",
		where: {
			and: [
				{
					id: {
						in: (kase.items ?? []).map(
							(item) => relationId(item.orderItem) ?? "",
						),
					},
				},
				{ fulfillmentStatus: { equals: "return_requested" } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	await applyReservedTransition(
		req,
		order,
		{
			...(items.docs.length
				? {
						items: {
							ids: items.docs.map((item) => String(item.id)),
							to: "delivered" as const,
						},
					}
				: {}),
			set: {
				completionHold: hasDispute
					? "dispute"
					: activeCase
						? "return_case"
						: "none",
				returnCase: activeCase ? String(activeCase.id) : null,
			},
		},
		{
			type:
				terminal === "cancelled"
					? "order.return_cancelled"
					: "order.return_expired",
			actorType: terminal === "cancelled" ? "buyer" : "system",
			...(terminal === "cancelled" && actorId ? { actor: actorId } : {}),
			visibility: "both",
			metadata: {
				caseId: String(kase.id),
				activeDispute: hasDispute,
				terminal,
			},
		},
	);
	if (!activeCase && hold) {
		await releaseHold(req, String(hold.id), {
			releasedBy: actorId,
			note:
				terminal === "cancelled"
					? "Return case cancelled before shipment."
					: "Return shipment deadline elapsed.",
		});
	}
}

export async function shipReturn(
	payload: Payload,
	buyer: ServiceUser,
	caseId: string,
	input: ShipReturnInput,
	now = new Date(),
): Promise<ReturnCase> {
	return withTransaction(
		payload,
		async (req) => {
			const kase = await loadCase(req, caseId);
			requireBuyer(kase, buyer);
			if (
				kase.status !== "awaiting_shipment" ||
				kase.returnMethod === "seller_pickup"
			) {
				throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
			}
			if (input.returnMethod !== kase.returnMethod) {
				throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
			}
			if (input.evidenceIds?.length) {
				const evidence = await req.payload.find({
					collection: "dispute-evidence",
					where: {
						and: [
							{ id: { in: input.evidenceIds } },
							{ returnCase: { equals: caseId } },
							{ uploadedBy: { equals: buyer.id } },
							{ kind: { equals: "shipping_proof" } },
						],
					},
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
					req,
				});
				if (evidence.docs.length !== new Set(input.evidenceIds).size) {
					throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
				}
			}
			const tracking = input.returnTracking?.trim();
			const moved = await moveCase(req, kase, "in_transit", {
				actorType: "buyer",
				actor: buyer.id,
				...(input.returnMethod === "courier"
					? { note: "Courier return." }
					: {}),
			});
			return req.payload.update({
				collection: "return-cases",
				id: caseId,
				req,
				overrideAccess: true,
				data: {
					returnTracking: tracking || null,
					shippedAt: now.toISOString(),
					statusHistory: (moved.statusHistory ?? []).map(
						(entry, index, rows) =>
							index === rows.length - 1
								? { ...entry, at: now.toISOString() }
								: entry,
					),
				},
			});
		},
		{ user: buyer },
	);
}

export async function recordPickup(
	payload: Payload,
	member: ServiceUser,
	caseId: string,
	now = new Date(),
): Promise<ReturnCase> {
	return withTransaction(
		payload,
		async (req) => {
			const kase = await loadCase(req, caseId);
			await requireReturnShopRole(req, kase, member);
			if (
				kase.status !== "awaiting_shipment" ||
				kase.returnMethod !== "seller_pickup"
			) {
				throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
			}
			return moveCase(req, kase, "in_transit", {
				actorType: "seller",
				actor: member.id,
				note: `Seller pickup recorded at ${now.toISOString()}.`,
			});
		},
		{ user: member },
	);
}

export async function receiveReturn(
	payload: Payload,
	member: ServiceUser,
	caseId: string,
	now = new Date(),
): Promise<ReturnCase> {
	return withTransaction(
		payload,
		async (req) => {
			const kase = await loadCase(req, caseId);
			await requireReturnShopRole(req, kase, member);
			return markReceived(req, kase, "seller", member.id, now);
		},
		{ user: member },
	);
}

async function markReceived(
	req: PayloadRequest,
	kase: ReturnCase,
	actorType: "seller" | "system",
	actor: string | undefined,
	now: Date,
): Promise<ReturnCase> {
	if (kase.status !== "in_transit") {
		throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
	}
	const settings = await getReturnSettings(req.payload);
	const received = await moveCase(req, kase, "received", {
		actorType,
		...(actor ? { actor } : {}),
	});
	const updated = await req.payload.update({
		collection: "return-cases",
		id: String(kase.id),
		req,
		overrideAccess: true,
		data: {
			receivedAt: now.toISOString(),
			deadlines: {
				...received.deadlines,
				inspectBy: daysAfter(now, settings.inspectDays),
				refundBy: daysAfter(now, settings.refundDays),
			},
		},
	});
	const notify = () => notifyReturnReceived(req, updated);
	if (!onCommit(commitContextOf(req), notify)) await notify();
	return updated;
}

export async function cancelReturn(
	payload: Payload,
	buyer: ServiceUser,
	caseId: string,
): Promise<ReturnCase> {
	return withTransaction(
		payload,
		async (req) => {
			const kase = await loadCase(req, caseId);
			requireBuyer(kase, buyer);
			if (
				!["requested", "approved", "awaiting_shipment"].includes(kase.status)
			) {
				throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
			}
			const cancelled = await moveCase(req, kase, "cancelled", {
				actorType: "buyer",
				actor: buyer.id,
			});
			await reconcileCancelledReturn(req, cancelled, buyer.id);
			return cancelled;
		},
		{ user: buyer },
	);
}

export async function inspectReturn(
	payload: Payload,
	member: ServiceUser,
	caseId: string,
	input: { items: InspectReturnItemInput[] },
	now = new Date(),
): Promise<ReturnCase> {
	return inspectReturnAs(payload, member, caseId, input, now, "seller");
}

async function inspectReturnAs(
	payload: Payload,
	member: ServiceUser | null,
	caseId: string,
	input: { items: InspectReturnItemInput[] },
	now: Date,
	actorType: "seller" | "system",
): Promise<ReturnCase> {
	return withTransaction(
		payload,
		async (req) => {
			const kase = await loadCase(req, caseId);
			if (member) await requireReturnShopRole(req, kase, member);
			if (
				actorType === "system" &&
				(kase.status !== "received" ||
					!kase.deadlines?.inspectBy ||
					Date.parse(kase.deadlines.inspectBy) > now.getTime())
			) {
				return kase;
			}
			if (kase.status !== "received" || !input.items.length) {
				throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
			}
			const memberId = member?.id;
			const originalItems = kase.items ?? [];
			if (input.items.length !== originalItems.length) {
				throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
			}
			const supplied = new Map(
				input.items.map((item) => [item.orderItemId, item]),
			);
			if (supplied.size !== input.items.length) {
				throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
			}
			const inspectedItems: NonNullable<ReturnCase["items"]> = [];
			for (const row of originalItems) {
				const orderItemId = relationId(row.orderItem);
				const inspection = supplied.get(orderItemId ?? "");
				if (!orderItemId || !inspection) {
					throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
				}
				const deduction = inspection.deductionAmount ?? 0;
				if (!Number.isSafeInteger(deduction) || deduction < 0) {
					throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
				}
				if (deduction > 0) {
					if (!memberId) {
						throw new ServiceError(ERROR_CODES.returnDeductionNotAllowed, 400);
					}
					const allowed = deductionAllowed({
						basis: kase.basis,
						itemPrice: Number(row.unitPrice ?? 0) * Number(row.quantity ?? 0),
						amount: deduction,
					});
					if (!allowed.ok) throw new ServiceError(allowed.code, 400);
				}
				if (deduction > 0 && !inspection.evidenceIds?.length) {
					throw new ServiceError(
						ERROR_CODES.returnDeductionEvidenceRequired,
						400,
					);
				}
				if (deduction > 0 && !inspection.note?.trim()) {
					throw new ServiceError(
						ERROR_CODES.returnDeductionEvidenceRequired,
						400,
					);
				}
				if (deduction > 0) {
					const evidence = await req.payload.find({
						collection: "dispute-evidence",
						where: {
							and: [
								{ id: { in: inspection.evidenceIds ?? [] } },
								{ returnCase: { equals: caseId } },
								{ uploadedBy: { equals: memberId } },
								{ visibility: { equals: "parties" } },
							],
						},
						limit: 0,
						pagination: false,
						depth: 0,
						overrideAccess: true,
						req,
					});
					if (evidence.docs.length !== new Set(inspection.evidenceIds).size) {
						throw new ServiceError(
							ERROR_CODES.returnDeductionEvidenceRequired,
							400,
						);
					}
				}
				const variantId = relationId(row.variant);
				if (
					inspection.outcome === "restock" ||
					["damaged_by_buyer", "damaged_in_transit", "not_matching"].includes(
						String(inspection.outcome),
					)
				) {
					if (variantId) {
						const variant = await req.payload.findByID({
							collection: "product-variants",
							id: variantId,
							depth: 0,
							overrideAccess: true,
							req,
						});
						if (variant.trackInventory === true) {
							const quantity = Number(row.quantity ?? 0);
							await applyMovement(req, {
								variant,
								type: "return",
								quantity,
								note: `Return case ${kase.number}`,
								actorId: member?.id ?? null,
								orderRef: kase.number,
							});
							if (inspection.outcome !== "restock") {
								await applyMovement(req, {
									variant: {
										...variant,
										stockOnHand: Number(variant.stockOnHand ?? 0) + quantity,
									},
									type: "loss",
									quantity: -quantity,
									note: `Return case ${kase.number}: returned unsellable`,
									actorId: member?.id ?? null,
									orderRef: kase.number,
								});
							}
						}
					}
				}
				inspectedItems.push({
					...row,
					inspection: {
						outcome: inspection.outcome,
						deductionAmount: deduction,
						note: inspection.note?.trim() || null,
					},
				});
			}
			if (supplied.size !== inspectedItems.length) {
				throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
			}
			const totalDeduction = inspectedItems.reduce(
				(sum, item) => sum + Number(item.inspection?.deductionAmount ?? 0),
				0,
			);
			const order = await req.payload.findByID({
				collection: "orders",
				id: relationId(kase.order) ?? "",
				depth: 0,
				overrideAccess: true,
				req,
			});
			const goods = originalItems.reduce(
				(sum, item) =>
					sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0),
				0,
			);
			const allOrderItems = await req.payload.find({
				collection: "order-items",
				where: { order: { equals: relationId(kase.order) ?? "" } },
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const returnedQuantities = new Map(
				originalItems.map((item) => [
					relationId(item.orderItem) ?? "",
					Number(item.quantity ?? 0),
				]),
			);
			const fullOrder =
				allOrderItems.docs.length === originalItems.length &&
				(await Promise.all(
					originalItems.map(async (item) => {
						const orderItem = await req.payload.findByID({
							collection: "order-items",
							id: relationId(item.orderItem) ?? "",
							depth: 0,
							overrideAccess: true,
							req,
						});
						return Number(item.quantity ?? 0) === Number(orderItem.quantity);
					}),
				).then((matches) => matches.every(Boolean))) &&
				allOrderItems.docs.every(
					(item) =>
						returnedQuantities.get(String(item.id)) === Number(item.quantity),
				);
			const breakdown = caseBreakdown({
				basis: kase.basis,
				goods,
				fullOrder,
				orderDeliveryFee: Number(
					order.amounts?.deliveryFee ?? order.delivery.fee ?? 0,
				),
				documentedReturnShipping: 0,
				returnShippingPaidBy: null,
				buyerProtectionFee:
					order.paymentMethod === "mobile_money"
						? Number(order.amounts?.buyerProtectionFee ?? 0)
						: 0,
				deduction: totalDeduction,
				settings: await getReturnSettings(req.payload),
			});
			const inspected = await moveCase(req, kase, "inspected", {
				actorType,
				...(member ? { actor: member.id } : {}),
			});
			const updated =
				totalDeduction > 0
					? inspected
					: await moveCase(req, inspected, "refund_pending", {
							actorType,
							note: "Inspection completed without a deduction.",
						});
			const inspectedCase = await req.payload.update({
				collection: "return-cases",
				id: caseId,
				req,
				overrideAccess: true,
				data: {
					items: inspectedItems,
					inspectedAt: now.toISOString(),
					deadlines: {
						...updated.deadlines,
						...(totalDeduction > 0
							? {
									deductionRespondBy: new Date(
										now.getTime() +
											(await getDisputeSettings(req.payload)).respondHours *
												3_600_000,
									).toISOString(),
								}
							: {}),
					},
					refund: {
						...updated.refund,
						amount: breakdown.amount,
						breakdown: {
							goods: breakdown.goods,
							outboundDelivery: breakdown.outboundDelivery,
							returnShipping: breakdown.returnShipping,
							buyerProtectionFee: breakdown.buyerProtectionFee,
							deduction: breakdown.deduction,
						},
					},
				},
			});
			const notify = () => notifyReturnInspected(req, inspectedCase);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return inspectedCase;
		},
		member ? { user: member } : undefined,
	);
}

export async function respondToReturnDeduction(
	payload: Payload,
	buyer: ServiceUser,
	caseId: string,
	action: "accept" | "contest",
	now = new Date(),
): Promise<ReturnCase> {
	return withTransaction(
		payload,
		async (req) => {
			const kase = await loadCase(req, caseId);
			requireBuyer(kase, buyer);
			const hasDeduction = (kase.items ?? []).some(
				(item) => Number(item.inspection?.deductionAmount ?? 0) > 0,
			);
			if (kase.status !== "inspected" || !hasDeduction) {
				throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
			}
			const deadline = kase.deadlines?.deductionRespondBy;
			if (!deadline || Date.parse(deadline) < now.getTime()) {
				throw new ServiceError(ERROR_CODES.returnInvalidTransition, 409);
			}
			if (action === "accept") {
				return moveCase(req, kase, "refund_pending", {
					actorType: "buyer",
					actor: buyer.id,
					at: now,
					note: "Buyer accepted the inspection deduction.",
				});
			}
			const dispute = await openDeductionDispute(req, kase, {
				buyerAccepted: false,
				description: `Buyer contested the deduction for return ${kase.number}.`,
			});
			await moveCase(req, kase, "disputed", {
				actorType: "buyer",
				actor: buyer.id,
				at: now,
				note: `Deduction contested; dispute ${dispute.number} opened.`,
			});
			const updatedCase = await req.payload.update({
				collection: "return-cases",
				id: caseId,
				req,
				overrideAccess: true,
				data: { dispute: String(dispute.id) },
			});
			const notify = () => notifyDisputeOpened(req, dispute);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return updatedCase;
		},
		{ user: buyer },
	);
}

async function presumeReturnInspection(
	payload: Payload,
	caseId: string,
	now: Date,
): Promise<ReturnCase> {
	const kase = await payload.findByID({
		collection: "return-cases",
		id: caseId,
		depth: 0,
		overrideAccess: true,
	});
	const items = (kase.items ?? []).flatMap((item) => {
		const orderItemId = relationId(item.orderItem);
		return orderItemId
			? [{ orderItemId, outcome: "restock" as const, deductionAmount: 0 }]
			: [];
	});
	return inspectReturnAs(payload, null, caseId, { items }, now, "system");
}

const DAY_MS = 86_400_000;

async function loadReturnItems(
	req: PayloadRequest,
	orderId: string,
	input: ReturnItemInput[],
): Promise<Array<{ item: OrderItem; quantity: number }>> {
	if (!input.length) {
		throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
	}
	const seen = new Set<string>();
	const loaded: Array<{ item: OrderItem; quantity: number }> = [];
	for (const row of input) {
		if (
			seen.has(row.orderItemId) ||
			!Number.isInteger(row.quantity) ||
			row.quantity < 1
		) {
			throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
		}
		seen.add(row.orderItemId);
		let item: OrderItem;
		try {
			item = await req.payload.findByID({
				collection: "order-items",
				id: row.orderItemId,
				depth: 0,
				overrideAccess: true,
				req,
			});
		} catch {
			throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
		}
		if (relationId(item.order) !== orderId) {
			throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
		}
		const returned = Number(item.returnedQuantity ?? 0);
		if (row.quantity > Number(item.quantity) - returned) {
			throw new ServiceError(ERROR_CODES.returnItemsInvalid, 400);
		}
		loaded.push({ item, quantity: row.quantity });
	}
	return loaded;
}

/** P4-compatible entry point; withdrawal remains available independently of disputes. */
export async function openWithdrawal(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
	input: OpenWithdrawalInput,
): Promise<{ caseNumber: string; caseId: string }> {
	const { audience } = await requireOrderAudience(payload, user, orderId);
	if (audience.kind !== "buyer") {
		throw new ServiceError(ERROR_CODES.forbidden, 403);
	}
	const number = await nextNumber(payload, "RET", new Date());
	return withTransaction(
		payload,
		async (req) => {
			const order = await req.payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const buyerId = relationId(order.buyer);
			const shopId = relationId(order.shop);
			if (!buyerId || !shopId || buyerId !== user.id) {
				throw new ServiceError(ERROR_CODES.orderNotFound, 404);
			}
			const lines = await loadReturnItems(req, orderId, input.items);
			const settings = await getOrderSettings(req.payload);
			const returnSettings = await getReturnSettings(req.payload);
			const deliveredAt = order.timestamps?.deliveredAt;
			const cutoff = deliveredAt
				? Date.parse(deliveredAt) + settings.withdrawalDays * DAY_MS
				: Number.NaN;
			if (
				!Number.isFinite(cutoff) ||
				!["delivered", "completed"].includes(order.status)
			) {
				throw new ServiceError(ERROR_CODES.returnNotEligible, 409);
			}
			const now = new Date();
			const expired = now.getTime() > cutoff;
			const returnMethod = input.returnMethod ?? "buyer_drop_off";
			const activeCases = await req.payload.find({
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
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const requestedItemIds = new Set(
				lines.map(({ item }) => String(item.id)),
			);
			const overlaps = activeCases.docs.some((activeCase) =>
				(activeCase.items ?? []).some((entry) =>
					requestedItemIds.has(relationId(entry.orderItem) ?? ""),
				),
			);
			if (overlaps) {
				throw new ServiceError(ERROR_CODES.returnAlreadyOpen, 409);
			}
			for (const { item } of lines) {
				const categoryId = item.snapshot?.categoryId;
				if (!categoryId) continue;
				try {
					const category = await req.payload.findByID({
						collection: "categories",
						id: categoryId,
						depth: 0,
						overrideAccess: true,
						req,
					});
					if (category.withdrawalExcluded) {
						throw new ServiceError(ERROR_CODES.returnNotEligible, 409);
					}
				} catch (error) {
					if (error instanceof ServiceError) throw error;
					throw new ServiceError(ERROR_CODES.returnNotEligible, 409);
				}
			}
			const created = await req.payload.create({
				collection: "return-cases",
				req,
				overrideAccess: true,
				data: {
					number,
					basis: "withdrawal",
					order: orderId,
					shop: shopId,
					buyer: buyerId,
					openedByType: "buyer",
					openedBy: buyerId,
					items: lines.map(({ item, quantity }) => ({
						orderItem: String(item.id),
						variant: relationId(item.variant),
						quantity,
						unitPrice: item.unitPrice,
					})),
					reasonText: input.reasonText?.trim() || null,
					returnRequired: true,
					returnMethod,
					deadlines: { requestDeadline: new Date(cutoff).toISOString() },
					status: "requested",
					statusHistory: [
						{
							status: "requested",
							actorType: "buyer",
							actor: buyerId,
							at: now.toISOString(),
						},
					],
				},
			});
			if (expired) {
				const rejected = await moveCase(req, created, "rejected", {
					actorType: "system",
					note: "The withdrawal window has closed.",
				});
				await req.payload.update({
					collection: "return-cases",
					id: String(rejected.id),
					req,
					overrideAccess: true,
					data: { rejectionReason: "window_closed" },
				});
				return { caseNumber: number, caseId: String(created.id) };
			}
			const approved = await moveCase(req, created, "approved", {
				actorType: "system",
				note: "Withdrawal eligibility confirmed.",
			});
			const awaitingShipment = await moveCase(
				req,
				approved,
				"awaiting_shipment",
				{ actorType: "system" },
			);
			const persisted = await req.payload.update({
				collection: "return-cases",
				id: String(awaitingShipment.id),
				req,
				overrideAccess: true,
				data: {
					deadlines: {
						...awaitingShipment.deadlines,
						requestDeadline: new Date(cutoff).toISOString(),
						...(returnMethod === "seller_pickup"
							? {
									pickupBy: new Date(
										now.getTime() + returnSettings.sellerPickupDays * DAY_MS,
									).toISOString(),
								}
							: {}),
						shipBy: new Date(
							now.getTime() + returnSettings.shipByDays * DAY_MS,
						).toISOString(),
					},
				},
			});
			await applyReservedTransition(
				req,
				order,
				{
					items: {
						ids: lines.map(({ item }) => String(item.id)),
						to: "return_requested",
					},
					set: { completionHold: "return_case", returnCase: created.id },
				},
				{
					type: "order.withdrawal_requested",
					actorType: "buyer",
					actor: buyerId,
					note: input.reasonText?.trim() || null,
					visibility: "both",
					metadata: { caseId: String(created.id), caseNumber: number },
				},
			);
			if (order.paymentMethod === "mobile_money") {
				await createHold(req, {
					scope: "order",
					shop: shopId,
					order: orderId,
					reason: "return_open",
					createdByType: "system",
				});
			}
			const notify = () =>
				Promise.all([
					notifyReturnRequested(req, persisted),
					notifyReturnInstructions(req, persisted),
				]);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return { caseNumber: number, caseId: String(created.id) };
		},
		{ user },
	);
}

/** Closes stale requests after re-reading status inside each transaction. */
export async function advanceReturnCases(
	payload: Payload,
	now = new Date(),
): Promise<{
	rejected: string[];
	expired: string[];
	pickupWaived: string[];
	received: string[];
	inspected: string[];
	deductionContested: string[];
}> {
	const returnSettings = await getReturnSettings(payload);
	const candidates = await payload.find({
		collection: "return-cases",
		where: {
			and: [
				{ status: { equals: "requested" } },
				{ "deadlines.requestDeadline": { less_than_equal: now.toISOString() } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const rejected: string[] = [];
	for (const candidate of candidates.docs) {
		const id = String(candidate.id);
		const didReject = await withTransaction(payload, async (req) => {
			const current = await loadCase(req, id);
			if (
				current.status !== "requested" ||
				!current.deadlines?.requestDeadline ||
				Date.parse(current.deadlines.requestDeadline) > now.getTime()
			) {
				return false;
			}
			const moved = await moveCase(req, current, "rejected", {
				actorType: "system",
				note: "The return request deadline elapsed before it could be approved.",
			});
			await req.payload.update({
				collection: "return-cases",
				id,
				req,
				overrideAccess: true,
				data: { rejectionReason: "request_deadline_elapsed" },
			});
			return moved.status === "rejected";
		});
		if (didReject) rejected.push(id);
	}
	const shipmentDeadlines = await payload.find({
		collection: "return-cases",
		where: {
			and: [
				{ status: { equals: "awaiting_shipment" } },
				{ returnMethod: { not_equals: "seller_pickup" } },
				{ "deadlines.shipBy": { less_than_equal: now.toISOString() } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const expired: string[] = [];
	for (const candidate of shipmentDeadlines.docs) {
		const id = String(candidate.id);
		const didExpire = await withTransaction(payload, async (req) => {
			const current = await loadCase(req, id);
			if (
				current.status !== "awaiting_shipment" ||
				!current.deadlines?.shipBy ||
				Date.parse(current.deadlines.shipBy) > now.getTime()
			) {
				return false;
			}
			const moved = await moveCase(req, current, "expired", {
				actorType: "system",
				note: "The buyer did not ship the return before the deadline.",
			});
			await reconcileCancelledReturn(req, moved, undefined, "expired");
			return moved.status === "expired";
		});
		if (didExpire) expired.push(id);
	}
	const pickupDeadlines = await payload.find({
		collection: "return-cases",
		where: {
			and: [
				{ status: { equals: "awaiting_shipment" } },
				{ returnMethod: { equals: "seller_pickup" } },
				{ "deadlines.pickupBy": { less_than_equal: now.toISOString() } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const pickupWaived: string[] = [];
	for (const candidate of pickupDeadlines.docs) {
		const id = String(candidate.id);
		const didWaive = await withTransaction(payload, async (req) => {
			const current = await loadCase(req, id);
			if (
				current.status !== "awaiting_shipment" ||
				current.returnMethod !== "seller_pickup" ||
				!current.deadlines?.pickupBy ||
				Date.parse(current.deadlines.pickupBy) > now.getTime()
			) {
				return false;
			}
			await req.payload.update({
				collection: "return-cases",
				id,
				req,
				overrideAccess: true,
				data: { returnRequired: false },
			});
			const moved = await moveCase(req, current, "refund_pending", {
				actorType: "system",
				note: "Seller pickup was missed; return waived and refund may proceed.",
			});
			return moved.status === "refund_pending";
		});
		if (didWaive) pickupWaived.push(id);
	}
	const transitCases = await payload.find({
		collection: "return-cases",
		where: {
			and: [
				{ status: { equals: "in_transit" } },
				{
					shippedAt: {
						less_than_equal: new Date(
							now.getTime() - returnSettings.receivePresumptionDays * DAY_MS,
						).toISOString(),
					},
				},
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const received: string[] = [];
	for (const candidate of transitCases.docs) {
		const id = String(candidate.id);
		const didReceive = await withTransaction(payload, async (req) => {
			const current = await loadCase(req, id);
			const shippedAt = current.shippedAt
				? Date.parse(current.shippedAt)
				: Number.NaN;
			if (
				current.status !== "in_transit" ||
				!Number.isFinite(shippedAt) ||
				shippedAt + returnSettings.receivePresumptionDays * DAY_MS >
					now.getTime()
			)
				return false;
			const hasProof =
				Boolean(current.returnTracking?.trim()) ||
				(
					await req.payload.find({
						collection: "dispute-evidence",
						where: {
							and: [
								{ returnCase: { equals: id } },
								{ kind: { equals: "shipping_proof" } },
								{ uploadedByType: { equals: "buyer" } },
							],
						},
						limit: 1,
						depth: 0,
						overrideAccess: true,
						req,
					})
				).docs.length > 0;
			if (!hasProof) return false;
			await markReceived(req, current, "system", undefined, now);
			return true;
		});
		if (didReceive) received.push(id);
	}
	const inspectionCases = await payload.find({
		collection: "return-cases",
		where: {
			and: [
				{ status: { equals: "received" } },
				{ "deadlines.inspectBy": { less_than_equal: now.toISOString() } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const inspected: string[] = [];
	for (const candidate of inspectionCases.docs) {
		const id = String(candidate.id);
		const result = await presumeReturnInspection(payload, id, now);
		if (result.status === "refund_pending") inspected.push(id);
	}
	const deductions = await payload.find({
		collection: "return-cases",
		where: {
			and: [
				{ status: { equals: "inspected" } },
				{
					"deadlines.deductionRespondBy": {
						less_than_equal: now.toISOString(),
					},
				},
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const deductionContested: string[] = [];
	for (const candidate of deductions.docs) {
		const id = String(candidate.id);
		const didContest = await withTransaction(payload, async (req) => {
			const current = await loadCase(req, id);
			const hasDeduction = (current.items ?? []).some(
				(item) => Number(item.inspection?.deductionAmount ?? 0) > 0,
			);
			if (
				current.status !== "inspected" ||
				!hasDeduction ||
				!current.deadlines?.deductionRespondBy ||
				Date.parse(current.deadlines.deductionRespondBy) > now.getTime()
			) {
				return false;
			}
			const dispute = await openDeductionDispute(
				req,
				current,
				{ buyerAccepted: false },
				now,
			);
			const moved = await moveCase(req, current, "disputed", {
				actorType: "system",
				at: now,
				note: `Deduction response elapsed; dispute ${dispute.number} opened.`,
			});
			await req.payload.update({
				collection: "return-cases",
				id,
				req,
				overrideAccess: true,
				data: { dispute: String(dispute.id) },
			});
			return moved.status === "disputed";
		});
		if (didContest) deductionContested.push(id);
	}
	return {
		rejected,
		expired,
		pickupWaived,
		received,
		inspected,
		deductionContested,
	};
}
