import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { shipmentViewFor } from "@/services/delivery/serialize";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		const shipment = await ctx.payload.findByID({
			collection: "shipments",
			id: parsed.data.id,
			depth: 0,
			overrideAccess: true,
		});
		return Response.json(
			await shipmentViewFor(ctx.payload, shipment, ctx.user),
		);
	} catch (error) {
		return handleServiceError("shipments:get", error);
	}
}
