import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { contestDelivery, requireOrderBuyer } from "@/services/orders/delivery";
import { getOrderView } from "@/services/orders/queries";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	note: z.string().trim().min(1).max(500).optional(),
});

/**
 * The buyer's only recourse against a seller's declaration, and only while
 * `contestDelivery` says the window is still open — see that function for
 * why "not a declaration" and "too late" answer the same code.
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
		const order = await requireOrderBuyer(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
		);

		await withTransaction(
			ctx.payload,
			(req) =>
				contestDelivery(req, order, {
					note: body.data.note,
					actor: ctx.user.id,
				}),
			{ user: ctx.user },
		);

		return Response.json(
			await getOrderView(ctx.payload, ctx.user, parsedParams.data.id),
		);
	} catch (error) {
		return handleServiceError("orders:contest-delivery", error);
	}
}
