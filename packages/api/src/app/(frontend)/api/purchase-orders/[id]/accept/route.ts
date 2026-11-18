import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { acceptPurchaseOrder } from "@/services/purchaseOrders";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const context = await requireUser(request);
	if (context instanceof Response) return context;
	try {
		const purchaseOrder = await acceptPurchaseOrder(
			context.payload,
			context.user,
			parsed.data.id,
		);
		return Response.json(purchaseOrder);
	} catch (error) {
		return handleServiceError("purchaseOrders:accept", error);
	}
}
