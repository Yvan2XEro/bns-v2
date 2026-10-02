import { z } from "zod";
import { requireOrderShopPermission } from "@/access/orderAccess";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { HANDOVER_MAX_ATTEMPTS } from "@/lib/orderCodes";
import { getCounterStore } from "@/lib/rateLimit";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import {
	assertHandoverRateLimit,
	markDelivered,
} from "@/services/orders/delivery";
import { verifyHandoverCode } from "@/services/orders/handover";
import { getOrderView } from "@/services/orders/queries";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({ code: z.string().trim().min(1) });

/**
 * The courier is at the door: a shop member (`orders.process`) keys in the
 * four-digit code the buyer was sent. Success and failure diverge hard —
 * `verifyHandoverCode` writes nothing and `markDelivered` runs inside this
 * route's own transaction; a wrong code commits its own attempt record
 * (Task 13) and this route's transaction, having written nothing yet, rolls
 * back for free.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const { order, role } = await requireOrderShopPermission(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			"orders.process",
		);
		// Before any write: a wrong-code attempt against a terminal order must
		// never be recorded, or the order's event count would grow for an action
		// that was never legitimate in the first place.
		if (order.status !== "shipped") {
			throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
		}

		await assertHandoverRateLimit(getCounterStore(), order);

		try {
			await withTransaction(
				ctx.payload,
				async (req) => {
					await verifyHandoverCode(req, order, body.data.code, {
						actor: { type: "seller", id: ctx.user.id },
					});
					return markDelivered(req, order, {
						method: "otp",
						actorType: "seller",
						actorShopRole: role,
						actor: ctx.user.id,
					});
				},
				{ user: ctx.user },
			);
		} catch (error) {
			if (
				error instanceof ServiceError &&
				(error.code === ERROR_CODES.orderHandoverLocked ||
					error.code === ERROR_CODES.orderHandoverCodeInvalid)
			) {
				const fresh = await ctx.payload.findByID({
					collection: "orders",
					id: order.id,
					depth: 0,
					overrideAccess: true,
				});
				const attemptsLeft = Math.max(
					0,
					HANDOVER_MAX_ATTEMPTS - (fresh.handover?.attempts ?? 0),
				);
				return errorResponse(error.code, error.status, {
					handover: { locked: Boolean(fresh.handover?.lockedAt) },
					attemptsLeft,
				});
			}
			throw error;
		}

		return Response.json(
			await getOrderView(ctx.payload, ctx.user, parsedParams.data.id),
		);
	} catch (error) {
		return handleServiceError("orders:handover", error);
	}
}
