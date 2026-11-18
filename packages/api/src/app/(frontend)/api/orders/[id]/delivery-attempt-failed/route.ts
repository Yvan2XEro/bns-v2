import { z } from "zod";
import { requireOrderShopPermission } from "@/access/orderAccess";
import { ORDER_DELIVERY_FAILURE_REASONS } from "@/collections/Orders";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { reportFailedAttempt } from "@/services/orders/delivery";
import { getOrderView } from "@/services/orders/queries";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	reason: z.enum(ORDER_DELIVERY_FAILURE_REASONS),
	note: z.string().trim().min(1).max(500).optional(),
});

/**
 * The first failed attempt only. `reportFailedAttempt` itself refuses a
 * second one, or a `refused` reason, telling the caller to use
 * `mark-delivery-failed` instead — this route just forwards whatever it
 * answers.
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
		const { order } = await requireOrderShopPermission(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			"orders.process",
		);
		if (order.status !== "shipped") {
			throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
		}

		await withTransaction(
			ctx.payload,
			(req) =>
				reportFailedAttempt(req, order, {
					reason: body.data.reason,
					note: body.data.note,
					actor: ctx.user.id,
				}),
			{ user: ctx.user },
		);

		return Response.json(
			await getOrderView(ctx.payload, ctx.user, parsedParams.data.id),
		);
	} catch (error) {
		return handleServiceError("orders:delivery-attempt-failed", error);
	}
}
