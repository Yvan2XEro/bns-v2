import type { Payload, PayloadRequest } from "payload";
import { requireOrderAudience } from "../../access/orderAccess";
import { ERROR_CODES } from "../../lib/errors";
import { getOrderSettings } from "../../lib/orderSettings";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import { withTransaction } from "../../lib/transactions";
import type { OrderItem } from "../../payload-types";
import { nextNumber } from "../sequences";
import type { ServiceUser } from "../shops";
import { applyTransition } from "./transitions";

export interface WithdrawalItemInput {
	orderItemId: string;
	quantity: number;
}

export interface WithdrawalInput {
	items: WithdrawalItemInput[];
	reasonText?: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Art. 20: the fourteen-day (here, the settings-configured) right of
 * withdrawal runs from the day the buyer takes physical possession of the
 * goods, never from the day they placed the order — an off-by-one against
 * `deliveredAt` either denies a right the law grants or extends one no
 * order should keep indefinitely. The ceiling is inclusive: the window's
 * last day still opens a case, the instant after it does not.
 */
function withdrawalDeadline(deliveredAt: string, days: number): number {
	return new Date(deliveredAt).getTime() + days * MS_PER_DAY;
}

/**
 * Loads and validates every named line against the order it claims to
 * belong to: no duplicate line, a positive quantity, and never more than
 * the line itself holds. A quantity above the line's own is refused here
 * rather than clamped, because silently shrinking the request would record
 * a case for less than the buyer actually asked to return.
 */
async function loadRequestedItems(
	req: PayloadRequest,
	orderId: string,
	items: WithdrawalItemInput[],
): Promise<Array<{ item: OrderItem; quantity: number }>> {
	if (items.length === 0) {
		throw new ServiceError(
			ERROR_CODES.validation,
			400,
			"at least one item is required",
		);
	}
	const seen = new Set<string>();
	const loaded: Array<{ item: OrderItem; quantity: number }> = [];
	for (const line of items) {
		if (seen.has(line.orderItemId)) {
			throw new ServiceError(
				ERROR_CODES.validation,
				400,
				"an item cannot be named twice",
			);
		}
		seen.add(line.orderItemId);
		if (!Number.isInteger(line.quantity) || line.quantity < 1) {
			throw new ServiceError(
				ERROR_CODES.validation,
				400,
				"quantity must be a positive integer",
			);
		}
		let item: OrderItem;
		try {
			item = await req.payload.findByID({
				collection: "order-items",
				id: line.orderItemId,
				depth: 0,
				overrideAccess: true,
				req,
			});
		} catch {
			throw new ServiceError(ERROR_CODES.notFound, 404, "order item not found");
		}
		if (relationId(item.order) !== orderId) {
			throw new ServiceError(ERROR_CODES.notFound, 404, "order item not found");
		}
		if (line.quantity > item.quantity) {
			throw new ServiceError(
				ERROR_CODES.validation,
				400,
				"quantity exceeds the item's quantity",
			);
		}
		loaded.push({ item, quantity: line.quantity });
	}
	return loaded;
}

/**
 * Opens a buyer's withdrawal request: creates the `return-cases` row
 * (Task 6) in `requested` and moves the named items to
 * `return_requested` (Task 8's `applyTransition`), in one transaction with
 * the `order.withdrawal_requested` event. That is the whole of P4's part —
 * no refund, no inspection outcome, no restocking call is decided here;
 * the case carries what P6 needs (the order, the shop, the buyer, which
 * items, how many, and why) and stops.
 *
 * P6 replaces this function's body with `services/returns.ts#openWithdrawal`
 * behind this exact signature, so a later phase does not grow a second
 * route for the same action.
 */
export async function openWithdrawal(
	payload: Payload,
	user: ServiceUser,
	orderId: string,
	input: WithdrawalInput,
): Promise<{ caseNumber: string; caseId: string }> {
	const { audience } = await requireOrderAudience(payload, user, orderId);
	if (audience.kind !== "buyer") {
		throw new ServiceError(ERROR_CODES.forbidden, 403);
	}

	// Art. 20 again: a withdrawal needs no reason. Whatever the buyer sends
	// is kept for the case file, never required to open one.
	const reasonText =
		typeof input.reasonText === "string" && input.reasonText.trim()
			? input.reasonText.trim()
			: null;

	// Deliberately outside the transaction (`services/sequences.ts`'s own
	// rule): a failed request below burns a case number rather than
	// contending with every other checkout/return on one counter document.
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

			if (order.status !== "delivered") {
				throw new ServiceError(
					ERROR_CODES.orderInvalidTransition,
					409,
					`order ${order.orderNumber} is ${order.status}, not delivered`,
				);
			}

			const deliveredAt = order.timestamps?.deliveredAt;
			if (!deliveredAt) {
				throw new ServiceError(
					ERROR_CODES.orderInvalidTransition,
					409,
					`order ${order.orderNumber} has no delivery timestamp`,
				);
			}

			const settings = await getOrderSettings(req.payload);
			const deadline = withdrawalDeadline(deliveredAt, settings.withdrawalDays);
			if (Date.now() > deadline) {
				throw new ServiceError(ERROR_CODES.orderWithdrawalWindowClosed, 409);
			}

			// The one-request-per-order guard: `returnCase` starts null and is
			// set, with `completionHold`, by the very update this call makes
			// below — so a second request for the same order always finds it
			// already set.
			if (relationId(order.returnCase)) {
				throw new ServiceError(
					ERROR_CODES.orderWithdrawalAlreadyRequested,
					409,
				);
			}

			const lines = await loadRequestedItems(req, orderId, input.items);

			const shopId = relationId(order.shop);
			if (!shopId) {
				throw new ServiceError(ERROR_CODES.server, 500, "order has no shop");
			}
			const buyerId = relationId(order.buyer) ?? user.id;

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
					items: lines.map(({ item, quantity }) => ({
						orderItem: item.id,
						variant: relationId(item.variant),
						quantity,
					})),
					reasonText,
					status: "requested",
					statusHistory: [
						{
							status: "requested",
							actorType: "buyer",
							actor: buyerId,
							at: new Date().toISOString(),
						},
					],
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
					note: reasonText,
					visibility: "both",
					metadata: { caseId: String(created.id), caseNumber: number },
				},
			);

			return { caseNumber: number, caseId: String(created.id) };
		},
		{ user },
	);
}
