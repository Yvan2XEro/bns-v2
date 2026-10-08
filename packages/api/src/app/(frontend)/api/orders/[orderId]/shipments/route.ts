import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getOrderShipments } from "@/services/delivery/serialize";

const paramsSchema = z.object({ orderId: z.string().trim().min(1) });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ orderId: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await getOrderShipments(ctx.payload, parsed.data.orderId, ctx.user),
		);
	} catch (error) {
		return handleServiceError("shipments:order-list", error);
	}
}
