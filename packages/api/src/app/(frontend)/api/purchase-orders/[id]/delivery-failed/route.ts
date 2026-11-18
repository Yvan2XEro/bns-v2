import { z } from "zod";
import { ORDER_DELIVERY_FAILURE_REASONS } from "@/collections/Orders";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import {
	failPurchaseOrderDelivery,
	getPurchaseOrderView,
} from "@/services/purchaseOrders";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	reason: z.enum(ORDER_DELIVERY_FAILURE_REASONS),
	note: z.string().trim().min(1).max(500).optional(),
	failedDeliveryCost: z.number().int().min(0),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const context = await requireUser(request);
	if (context instanceof Response) return context;
	try {
		await failPurchaseOrderDelivery(
			context.payload,
			context.user,
			parsedParams.data.id,
			body.data,
		);
		const view = await getPurchaseOrderView(
			context.payload,
			context.user,
			parsedParams.data.id,
		);
		return Response.json(view, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		return handleServiceError("purchaseOrders:delivery-failed", error);
	}
}
