import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getPurchaseOrderView } from "@/services/purchaseOrders";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const context = await requireUser(request);
	if (context instanceof Response) return context;
	try {
		const view = await getPurchaseOrderView(
			context.payload,
			context.user,
			parsed.data.id,
		);
		return Response.json(view, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		return handleServiceError("purchaseOrders:get", error);
	}
}
