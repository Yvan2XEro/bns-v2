import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { cancelResalePurchaseOrder } from "@/services/orders/acceptance";
import { getPurchaseOrderView } from "@/services/purchaseOrders";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	reason: z.enum([
		"seller_out_of_stock",
		"seller_cannot_deliver",
		"seller_other",
	]),
	note: z.string().trim().max(500).optional(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const context = await requireUser(request);
	if (context instanceof Response) return context;
	const body = await readBody(request);
	const parsedBody = bodySchema.safeParse(body);
	if (!parsedBody.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		await cancelResalePurchaseOrder(
			context.payload,
			context.user,
			parsedParams.data.id,
			parsedBody.data,
		);
		return Response.json(
			await getPurchaseOrderView(
				context.payload,
				context.user,
				parsedParams.data.id,
			),
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch (error) {
		return handleServiceError("purchaseOrders:cancel", error);
	}
}
