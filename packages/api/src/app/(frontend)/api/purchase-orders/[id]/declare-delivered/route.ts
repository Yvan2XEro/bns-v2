import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import {
	declarePurchaseOrderDelivered,
	getPurchaseOrderView,
} from "@/services/purchaseOrders";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	note: z.string().trim().min(1).max(500).optional(),
	photoId: z.string().trim().min(1).max(2000).optional(),
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
		await declarePurchaseOrderDelivered(
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
		return handleServiceError("purchaseOrders:declare-delivered", error);
	}
}
