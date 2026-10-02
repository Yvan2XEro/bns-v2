import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { markDelivered, requireOrderBuyer } from "@/services/orders/delivery";
import { getOrderView } from "@/services/orders/queries";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/**
 * The buyer's own confirmation, for when the courier never got a code read
 * out. Buyer-only: `requireOrderBuyer` answers `order.notFound` to a shop
 * member or staff, the same way a stranger would be answered, rather than
 * confirming the order exists for a caller this route is not for.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const order = await requireOrderBuyer(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
		);
		if (order.status !== "shipped") {
			throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
		}

		await withTransaction(
			ctx.payload,
			(req) =>
				markDelivered(req, order, {
					method: "buyer_confirmation",
					actorType: "buyer",
					actor: ctx.user.id,
				}),
			{ user: ctx.user },
		);

		return Response.json(
			await getOrderView(ctx.payload, ctx.user, parsedParams.data.id),
		);
	} catch (error) {
		return handleServiceError("orders:confirm-receipt", error);
	}
}
