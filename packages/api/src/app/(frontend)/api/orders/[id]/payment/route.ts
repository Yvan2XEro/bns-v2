import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import {
	findOrderForPayment,
	paymentStatusView,
} from "@/services/checkoutPayment";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/** The buyer's or a shop member's view of the order's latest payment attempt. */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const order = await findOrderForPayment(ctx.payload, parsedParams.data.id);
		return Response.json(await paymentStatusView(ctx.payload, order, ctx.user));
	} catch (error) {
		return handleServiceError("orders:payment", error);
	}
}
