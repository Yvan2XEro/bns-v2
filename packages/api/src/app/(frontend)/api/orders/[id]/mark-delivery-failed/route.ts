import { z } from "zod";
import { requireOrderShopPermission } from "@/access/orderAccess";
import { ORDER_DELIVERY_FAILURE_REASONS } from "@/collections/Orders";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import {
	actorTypeForShopRole,
	markDeliveryFailed,
} from "@/services/orders/delivery";
import { getOrderView } from "@/services/orders/queries";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	reason: z.enum(ORDER_DELIVERY_FAILURE_REASONS),
	note: z.string().trim().min(1).max(500).optional(),
});

/** The final disposition of a delivery that did not happen. */
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
		if (order.status !== "shipped") {
			throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
		}

		await withTransaction(
			ctx.payload,
			(req) =>
				markDeliveryFailed(req, order, {
					reason: body.data.reason,
					note: body.data.note,
					actorType: actorTypeForShopRole(role),
					actor: ctx.user.id,
				}),
			{ user: ctx.user },
		);

		return Response.json(
			await getOrderView(ctx.payload, ctx.user, parsedParams.data.id),
		);
	} catch (error) {
		return handleServiceError("orders:mark-delivery-failed", error);
	}
}
