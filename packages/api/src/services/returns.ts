import type { Payload, PayloadRequest } from "payload";
import { requireOrderAudience } from "../access/orderAccess";
import { RETURN_CASE_STATUSES } from "../collections/ReturnCases";
import { getReturnSettings } from "../lib/caseSettings";
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
	notifyReturnInstructions,
	notifyReturnRequested,
} from "./caseNotifications";
import { applyTransition } from "./orders/transitions";
import { createHold } from "./payoutHolds";
import { nextNumber } from "./sequences";
import type { ServiceUser } from "./shops";

export type ReturnCaseStatus = ReturnCase["status"];

export const RETURN_TRANSITIONS: Record<
	ReturnCaseStatus,
	readonly ReturnCaseStatus[]
> = {
	requested: ["approved", "rejected", "cancelled"],
	approved: ["awaiting_shipment", "refund_pending"],
	rejected: [],
	cancelled: [],
	awaiting_shipment: ["in_transit", "expired", "cancelled"],
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
					at: new Date().toISOString(),
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

export interface ReturnItemInput {
	orderItemId: string;
	quantity: number;
}

export interface OpenWithdrawalInput {
	items: ReturnItemInput[];
	reasonText?: string | null;
	returnMethod?: NonNullable<ReturnCase["returnMethod"]>;
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
			await applyTransition(
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
