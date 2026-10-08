import type { Payload, PayloadRequest, Where } from "payload";
import type { DisputeListRow } from "../contracts/disputes";
import type { OpenDisputeInput } from "../contracts/disputes";
import { requireOrderAudience } from "../access/orderAccess";
import { isModerator } from "../access/roles";
import { can, type ShopRole } from "../access/shopRoles";
import { getDisputeSettings, isDisputesOpen } from "../lib/caseSettings";
import {
	type DisputeReason,
	evidenceRequired,
	type OpenerRole,
	openerAllowed,
	reasonWindow,
} from "../lib/disputeRules";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type {
	Dispute,
	DisputeMessage,
	Order,
	ReturnCase,
} from "../payload-types";
import { notifyDisputeMessage, notifyDisputeOpened } from "./caseNotifications";
import { applyReservedTransition } from "./orders/transitions";
import { createHold } from "./payoutHolds";
import { holdOrderReviews } from "./reviewRelease";
import { nextNumber } from "./sequences";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

export async function listDisputes(
	payload: Payload,
	viewer: ServiceUser,
	options: {
		shopId?: string;
		status?: Dispute["status"];
		overdue?: boolean;
	} = {},
	now = new Date(),
): Promise<{ rows: DisputeListRow[]; awaitingCount: number }> {
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
	const result = await payload.find({
		collection: "disputes",
		where: { and: clauses },
		limit: 100,
		sort: "-createdAt",
		depth: 0,
		overrideAccess: true,
	});
	const allRows = await Promise.all(
		result.docs.map(async (dispute): Promise<DisputeListRow> => {
			const order = await payload.findByID({
				collection: "orders",
				id: relationId(dispute.order) ?? "",
				depth: 0,
				overrideAccess: true,
			});
			const nextDeadline =
				[dispute.deadlines?.respondBy, dispute.deadlines?.reviewDueAt]
					.filter((value): value is string => typeof value === "string")
					.sort((left, right) => Date.parse(left) - Date.parse(right))[0] ??
				null;
			return {
				id: String(dispute.id),
				number: dispute.number,
				orderNumber: order.orderNumber,
				subject: dispute.subject,
				reason: dispute.reason,
				status: dispute.status,
				amountAtStake: Number(dispute.amountAtStake ?? 0),
				nextDeadline,
				overdue: Boolean(
					nextDeadline && Date.parse(nextDeadline) <= now.getTime(),
				),
				createdAt: dispute.createdAt,
			};
		}),
	);
	const awaitingStatuses = buyerView
		? new Set<Dispute["status"]>(["awaiting_buyer", "under_review"])
		: new Set<Dispute["status"]>(["awaiting_seller", "under_review"]);
	const rows = allRows.filter(
		(row) =>
			(!options.status || row.status === options.status) &&
			(options.overdue !== true || row.overdue),
	);
	return {
		rows,
		awaitingCount: allRows.filter((row) => awaitingStatuses.has(row.status))
			.length,
	};
}

export const DISPUTE_TRANSITIONS: Record<
	NonNullable<Dispute["status"]>,
	readonly NonNullable<Dispute["status"]>[]
> = {
	open: ["awaiting_seller", "awaiting_buyer", "under_review", "withdrawn"],
	awaiting_seller: [
		"resolved_buyer",
		"awaiting_buyer",
		"under_review",
		"withdrawn",
	],
	awaiting_buyer: [
		"resolved_buyer",
		"resolved_seller",
		"resolved_split",
		"awaiting_seller",
		"under_review",
		"withdrawn",
	],
	under_review: [
		"awaiting_seller",
		"awaiting_buyer",
		"resolved_buyer",
		"resolved_seller",
		"resolved_split",
		"withdrawn",
	],
	resolved_buyer: [],
	resolved_seller: [],
	resolved_split: [],
	withdrawn: [],
};

export function assertDisputeTransition(
	from: NonNullable<Dispute["status"]>,
	to: NonNullable<Dispute["status"]>,
): void {
	if (!DISPUTE_TRANSITIONS[from].includes(to)) {
		throw new ServiceError(ERROR_CODES.disputeInvalidTransition, 409);
	}
}

export async function moveDispute(
	req: PayloadRequest,
	dispute: Dispute,
	to: NonNullable<Dispute["status"]>,
	actor: {
		type: NonNullable<
			NonNullable<Dispute["statusHistory"]>[number]["actorType"]
		>;
		id?: string;
		note?: string;
		at?: Date;
	},
): Promise<Dispute> {
	if (!dispute.status)
		throw new ServiceError(ERROR_CODES.disputeInvalidTransition, 409);
	assertDisputeTransition(dispute.status, to);
	const updated = await req.payload.update({
		collection: "disputes",
		where: {
			and: [
				{ id: { equals: String(dispute.id) } },
				{ status: { equals: dispute.status } },
			],
		},
		req,
		overrideAccess: true,
		data: {
			status: to,
			statusHistory: [
				...(dispute.statusHistory ?? []),
				{
					status: to,
					actorType: actor.type,
					...(actor.id ? { actor: actor.id } : {}),
					at: (actor.at ?? new Date()).toISOString(),
					note: actor.note,
				},
			],
		},
	});
	const moved = updated.docs[0];
	if (!moved) throw new ServiceError(ERROR_CODES.disputeInvalidTransition, 409);
	return moved;
}

export type { OpenDisputeInput };

function serviceError(
	code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
	status: number,
) {
	return new ServiceError(code, status);
}

async function paymentTimestamp(
	req: PayloadRequest,
	orderId: string,
): Promise<string | null> {
	const payment = await req.payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ targetType: { equals: "order" } },
				{ targetId: { equals: orderId } },
				{ status: { equals: "succeeded" } },
			],
		},
		sort: "createdAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const paid = payment.docs[0]?.statusHistory?.find(
		(row) => row.status === "succeeded",
	);
	return paid?.at ?? payment.docs[0]?.updatedAt ?? null;
}

async function activeReturnCase(
	req: PayloadRequest,
	orderId: string,
): Promise<ReturnCase | null> {
	const found = await req.payload.find({
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
	return found.docs[0] ?? null;
}

async function amountAtStake(
	req: PayloadRequest,
	order: Order,
): Promise<number> {
	if (order.paymentMethod === "mobile_money") {
		return Math.max(
			0,
			Number(order.amounts?.total ?? 0) -
				Number(order.settlement?.refundedAmount ?? 0),
		);
	}
	const items = await req.payload.find({
		collection: "order-items",
		where: { order: { equals: String(order.id) } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const goods = items.docs.reduce(
		(sum, item) =>
			sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0),
		0,
	);
	return goods + Number(order.amounts?.deliveryFee ?? order.delivery.fee ?? 0);
}

async function callerRole(
	order: Order,
	user: ServiceUser,
	shopAudience: { kind: "shop"; role: ShopRole } | null,
): Promise<OpenerRole | null> {
	if (relationId(order.buyer) === user.id) return "buyer";
	if (shopAudience?.kind === "shop") return "shop";
	return null;
}

async function createDispute(
	req: PayloadRequest,
	order: Order,
	actor: ServiceUser,
	role: OpenerRole,
	input: OpenDisputeInput,
	number: string,
	now: Date,
	options: {
		submitDirectly?: boolean;
		initialStatus?: "awaiting_seller";
		bypassWindow?: boolean;
		openedByType?: "buyer" | "seller" | "system";
	} = {},
): Promise<Dispute> {
	const settings = await getDisputeSettings(req.payload);
	const orderId = String(order.id);
	const shopId = relationId(order.shop);
	const buyerId = relationId(order.buyer);
	if (!shopId || !buyerId) throw serviceError(ERROR_CODES.disputeNotParty, 404);
	const window = reasonWindow(
		input.reason,
		role,
		{
			paymentMethod: order.paymentMethod,
			paymentStatus: order.paymentStatus,
			status: order.status,
			placedAt: order.timestamps?.placedAt ?? order.createdAt,
			shippedAt: order.timestamps?.shippedAt,
			deliveredAt: order.timestamps?.deliveredAt,
			paidAt: await paymentTimestamp(req, orderId),
		},
		settings,
		now,
	);
	if (!options.bypassWindow && !window.open) {
		throw serviceError(ERROR_CODES.disputeWindowClosed, 409);
	}
	const activeReturn = options.submitDirectly
		? null
		: await activeReturnCase(req, orderId);
	if (activeReturn && String(activeReturn.id) !== input.returnCaseId) {
		throw serviceError(ERROR_CODES.disputeReturnCaseActive, 409);
	}
	if (input.returnCaseId) {
		const linked = await req.payload
			.findByID({
				collection: "return-cases",
				id: input.returnCaseId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (!linked || relationId(linked.order) !== orderId) {
			throw serviceError(ERROR_CODES.disputeReturnCaseActive, 409);
		}
	}
	const items: NonNullable<Dispute["items"]> = [];
	for (const requested of input.items) {
		if (!Number.isSafeInteger(requested.quantity) || requested.quantity < 1) {
			throw serviceError(ERROR_CODES.disputeProposalInvalid, 400);
		}
		const item = await req.payload
			.findByID({
				collection: "order-items",
				id: requested.orderItemId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (
			!item ||
			relationId(item.order) !== orderId ||
			requested.quantity > item.quantity
		) {
			throw serviceError(ERROR_CODES.disputeProposalInvalid, 400);
		}
		items.push({ orderItem: String(item.id), quantity: requested.quantity });
	}
	if (!items.length)
		throw serviceError(ERROR_CODES.disputeProposalInvalid, 400);
	const stake = await amountAtStake(req, order);
	if (
		input.requestedAmount !== undefined &&
		(!Number.isSafeInteger(input.requestedAmount) ||
			input.requestedAmount < 0 ||
			input.requestedAmount > stake)
	) {
		throw serviceError(ERROR_CODES.disputeRefundExceedsOrder, 400);
	}
	const submitBy = new Date(
		now.getTime() + settings.submitAutoHours * 3_600_000,
	);
	let dispute = await req.payload.create({
		collection: "disputes",
		req,
		overrideAccess: true,
		data: {
			number,
			order: orderId,
			shop: shopId,
			buyer: buyerId,
			subject: input.subject ?? "goods",
			items,
			...(input.returnCaseId ? { returnCase: input.returnCaseId } : {}),
			reason: input.reason,
			openedByType:
				options.openedByType ?? (role === "buyer" ? "buyer" : "seller"),
			...(options.openedByType === "system" ? {} : { openedBy: actor.id }),
			description: input.description.trim(),
			requestedOutcome: input.requestedOutcome,
			...(input.requestedAmount !== undefined
				? { requestedAmount: input.requestedAmount }
				: {}),
			paymentMethod: order.paymentMethod,
			amountAtStake: stake,
			status: options.initialStatus ?? "open",
			statusHistory: [
				{
					status: options.initialStatus ?? "open",
					actorType:
						options.openedByType ?? (role === "buyer" ? "buyer" : "seller"),
					...(options.openedByType === "system" ? {} : { actor: actor.id }),
					at: now.toISOString(),
				},
			],
			deadlines: {
				submitBy: submitBy.toISOString(),
				...(options.initialStatus === "awaiting_seller"
					? {
							respondBy: new Date(
								now.getTime() + settings.respondHours * 3_600_000,
							).toISOString(),
						}
					: {}),
				...(options.submitDirectly
					? { reviewDueAt: submitBy.toISOString() }
					: {}),
			},
		},
	});
	if (options.submitDirectly) {
		dispute = await moveDispute(req, dispute, "under_review", {
			type: "system",
			note: "System opened the dispute from a case escalation.",
			at: now,
		});
	}
	await applyReservedTransition(
		req,
		order,
		{
			...(order.status === "shipped" || order.status === "delivered"
				? { status: "disputed" as const }
				: {}),
			set: { activeDispute: dispute.id, completionHold: "dispute" },
		},
		{
			type: "order.disputed",
			actorType:
				options.openedByType === "system"
					? "system"
					: role === "buyer"
						? "buyer"
						: "seller",
			...(options.openedByType === "system" ? {} : { actor: actor.id }),
			visibility: "both",
			metadata: { disputeId: String(dispute.id), reason: input.reason },
		},
	);
	await holdOrderReviews(req.payload, orderId, buyerId);
	if (order.paymentMethod === "mobile_money") {
		await createHold(req, {
			scope: "order",
			shop: shopId,
			order: orderId,
			reason: "dispute_open",
			createdByType: "system",
			note: `Dispute ${number}`,
		});
	}
	return dispute;
}

export async function openDispute(
	payload: Payload,
	opener: ServiceUser,
	orderId: string,
	input: OpenDisputeInput,
	now = new Date(),
): Promise<Dispute> {
	const settings = await getDisputeSettings(payload);
	if (!isDisputesOpen(settings))
		throw serviceError(ERROR_CODES.disputeDisabled, 403);
	const number = await nextNumber(payload, "DSP", now);
	return withTransaction(
		payload,
		async (req) => {
			const { order, audience } = await requireOrderAudience(
				payload,
				opener,
				orderId,
				req,
			);
			const role = await callerRole(
				order,
				opener,
				audience.kind === "shop" ? audience : null,
			);
			if (!role) throw serviceError(ERROR_CODES.disputeNotParty, 403);
			if (
				role === "shop" &&
				(audience.kind !== "shop" ||
					!["owner", "manager"].includes(audience.role))
			) {
				throw serviceError(ERROR_CODES.disputeNotParty, 403);
			}
			if (!openerAllowed(input.reason, role)) {
				throw serviceError(ERROR_CODES.disputeReasonNotAllowed, 403);
			}
			if (
				role === "shop" &&
				audience.kind === "shop" &&
				!can(audience.role, "orders.process")
			) {
				throw serviceError(ERROR_CODES.disputeNotParty, 403);
			}
			const active = await req.payload.find({
				collection: "disputes",
				where: {
					and: [
						{ order: { equals: orderId } },
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
			if (active.docs.length)
				throw serviceError(ERROR_CODES.disputeAlreadyOpen, 409);
			const withdrawn = await req.payload.find({
				collection: "disputes",
				where: {
					and: [
						{ order: { equals: orderId } },
						{ reason: { equals: input.reason } },
						{ status: { equals: "withdrawn" } },
					],
				},
				limit: 100,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const requestedItems = [...input.items]
				.map((item) => `${item.orderItemId}:${item.quantity}`)
				.sort();
			if (
				withdrawn.docs.some(
					(previous) =>
						[...(previous.items ?? [])]
							.map((item) => `${relationId(item.orderItem)}:${item.quantity}`)
							.sort()
							.every((item, index) => item === requestedItems[index]) &&
						(previous.items ?? []).length === requestedItems.length,
				)
			) {
				throw serviceError(ERROR_CODES.disputeAlreadyOpen, 409);
			}
			return createDispute(req, order, opener, role, input, number, now);
		},
		{ user: opener },
	);
}

export async function submitDispute(
	payload: Payload,
	opener: ServiceUser,
	disputeId: string,
	now = new Date(),
): Promise<Dispute> {
	return withTransaction(
		payload,
		async (req) => {
			const dispute = await req.payload.findByID({
				collection: "disputes",
				id: disputeId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (
				relationId(dispute.openedBy) !== opener.id ||
				dispute.openedByType === "system"
			) {
				throw serviceError(ERROR_CODES.disputeNotParty, 404);
			}
			if (dispute.status !== "open")
				throw serviceError(ERROR_CODES.disputeInvalidTransition, 409);
			if (
				dispute.deadlines?.submitBy &&
				Date.parse(dispute.deadlines.submitBy) < now.getTime()
			) {
				throw serviceError(ERROR_CODES.disputeWindowClosed, 409);
			}
			const required = evidenceRequired(dispute.reason);
			if (required > 0) {
				const count = await req.payload.count({
					collection: "dispute-evidence",
					where: {
						and: [
							{ dispute: { equals: disputeId } },
							{ uploadedBy: { equals: opener.id } },
							{ visibility: { equals: "parties" } },
						],
					},
					overrideAccess: true,
					req,
				});
				if (count.totalDocs < required)
					throw serviceError(ERROR_CODES.disputeEvidenceRequired, 400);
			}
			const settings = await getDisputeSettings(req.payload);
			const sellerOpened = dispute.openedByType === "seller";
			const moved = await moveDispute(
				req,
				dispute,
				sellerOpened ? "awaiting_buyer" : "awaiting_seller",
				{
					type: sellerOpened ? "seller" : "buyer",
					id: opener.id,
					at: now,
				},
			);
			const submitted = await req.payload.update({
				collection: "disputes",
				id: disputeId,
				req,
				overrideAccess: true,
				data: {
					deadlines: {
						...moved.deadlines,
						respondBy: new Date(
							now.getTime() + settings.respondHours * 3_600_000,
						).toISOString(),
					},
				},
			});
			const notify = () => notifyDisputeOpened(req, submitted);
			if (!onCommit(commitContextOf(req), notify)) await notify();
			return submitted;
		},
		{ user: opener },
	);
}

export async function postDisputeMessage(
	payload: Payload,
	author: ServiceUser,
	disputeId: string,
	input: {
		body: string;
		evidenceIds?: string[];
		visibility?: "parties" | "staff";
	},
	now = new Date(),
): Promise<DisputeMessage> {
	const body = input.body.trim();
	if (!body || body.length > 2000) {
		throw serviceError(ERROR_CODES.disputeProposalInvalid, 400);
	}
	return withTransaction(
		payload,
		async (req) => {
			const dispute = await req.payload.findByID({
				collection: "disputes",
				id: disputeId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (
				[
					"resolved_buyer",
					"resolved_seller",
					"resolved_split",
					"withdrawn",
				].includes(dispute.status)
			) {
				throw serviceError(ERROR_CODES.disputeInvalidTransition, 409);
			}
			const { audience } = await requireOrderAudience(
				req.payload,
				author,
				relationId(dispute.order) ?? "",
				req,
			);
			const moderator = audience.kind === "staff" && isModerator(author);
			if (!moderator && audience.kind !== "buyer" && audience.kind !== "shop") {
				throw serviceError(ERROR_CODES.disputeNotParty, 404);
			}
			if (input.visibility === "staff" && !moderator) {
				throw serviceError(ERROR_CODES.forbidden, 403);
			}
			const evidenceIds = [...new Set(input.evidenceIds ?? [])];
			if (evidenceIds.length > 5) {
				throw serviceError(ERROR_CODES.disputeProposalInvalid, 400);
			}
			if (evidenceIds.length) {
				const evidence = await req.payload.find({
					collection: "dispute-evidence",
					where: {
						and: [
							{ id: { in: evidenceIds } },
							{ dispute: { equals: disputeId } },
						],
					},
					limit: 0,
					pagination: false,
					depth: 0,
					overrideAccess: true,
					req,
				});
				if (evidence.docs.length !== evidenceIds.length) {
					throw serviceError(ERROR_CODES.disputeProposalInvalid, 400);
				}
			}
			const authorType = moderator
				? "moderator"
				: audience.kind === "buyer"
					? "buyer"
					: "seller";
			const message = await req.payload.create({
				collection: "dispute-messages",
				req,
				overrideAccess: true,
				data: {
					dispute: disputeId,
					authorType,
					author: author.id,
					kind: "message",
					body,
					evidence: evidenceIds,
					visibility: input.visibility ?? "parties",
				},
			});
			const lastNotified = dispute.lastMessageNotifiedAt
				? Date.parse(dispute.lastMessageNotifiedAt)
				: Number.NEGATIVE_INFINITY;
			if (now.getTime() - lastNotified >= 10 * 60_000) {
				await req.payload.update({
					collection: "disputes",
					id: disputeId,
					req,
					overrideAccess: true,
					data: { lastMessageNotifiedAt: now.toISOString() },
				});
				const notify = () => notifyDisputeMessage(req, dispute);
				if (!onCommit(commitContextOf(req), notify)) await notify();
			}
			return message;
		},
		{ user: author },
	);
}

export async function openDeductionDispute(
	req: PayloadRequest,
	kase: ReturnCase,
	input: { buyerAccepted: false; description?: string },
	now = new Date(),
): Promise<Dispute> {
	const order = await req.payload.findByID({
		collection: "orders",
		id: relationId(kase.order) ?? "",
		depth: 0,
		overrideAccess: true,
		req,
	});
	const number = await nextNumber(req.payload, "DSP", now);
	return createDispute(
		req,
		order,
		{ id: "system", role: "admin" },
		"shop",
		{
			reason: "damaged",
			subject: "goods",
			description:
				input.description ??
				`Buyer contested the deduction for return ${kase.number}.`,
			requestedOutcome: "partial_refund",
			items: (kase.items ?? []).map((item) => ({
				orderItemId: relationId(item.orderItem) ?? "",
				quantity: Number(item.quantity ?? 1),
			})),
			returnCaseId: String(kase.id),
		},
		number,
		now,
		{ submitDirectly: true, bypassWindow: true, openedByType: "system" },
	);
}

export async function openRefundContestDispute(
	req: PayloadRequest,
	kase: ReturnCase,
	buyer: ServiceUser,
	now = new Date(),
): Promise<Dispute> {
	const order = await req.payload.findByID({
		collection: "orders",
		id: relationId(kase.order) ?? "",
		depth: 0,
		overrideAccess: true,
		req,
	});
	const number = await nextNumber(req.payload, "DSP", now);
	return createDispute(
		req,
		order,
		buyer,
		"buyer",
		{
			reason: "not_received",
			subject: "refund",
			description: `Buyer contests the refund for return ${kase.number}.`,
			requestedOutcome: "full_refund",
			items: (kase.items ?? []).map((item) => ({
				orderItemId: relationId(item.orderItem) ?? "",
				quantity: Number(item.quantity ?? 1),
			})),
			returnCaseId: String(kase.id),
		},
		number,
		now,
		{ bypassWindow: true, initialStatus: "awaiting_seller" },
	);
}
