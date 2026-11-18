import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import {
	getPurchaseOrderView,
	handoverPurchaseOrder,
} from "@/services/purchaseOrders";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({ code: z.string().trim().min(1).max(32) });

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
		await handoverPurchaseOrder(
			context.payload,
			context.user,
			parsedParams.data.id,
			body.data.code,
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
		return handleServiceError("purchaseOrders:handover", error);
	}
}
