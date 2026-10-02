import { z } from "zod";
import { requireOrderShopPermission } from "@/access/orderAccess";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { markDelivered } from "@/services/orders/delivery";
import { getOrderView } from "@/services/orders/queries";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	note: z.string().trim().min(1).max(500).optional(),
	photo: z.string().trim().min(1).max(2000).optional(),
});

/**
 * The seller's declaration, for when the buyer cannot give the code either
 * — the weaker proof (art. 26). `markDelivered` opens the 48-hour contest
 * window on this path alone; `contest-delivery` is what a buyer who
 * disagrees calls before it closes.
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
		if (order.status !== "shipped") {
			throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
		}

		await withTransaction(
			ctx.payload,
			(req) =>
				markDelivered(req, order, {
					method: "seller_declaration",
					actorType: "seller",
					actorShopRole: role,
					actor: ctx.user.id,
					note: body.data.note,
					photo: body.data.photo,
				}),
			{ user: ctx.user },
		);

		return Response.json(
			await getOrderView(ctx.payload, ctx.user, parsedParams.data.id),
		);
	} catch (error) {
		return handleServiceError("orders:declare-delivered", error);
	}
}
