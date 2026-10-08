import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { startShipment } from "@/services/delivery/handover";
import {
	requireShopShipment,
	shipmentActionResult,
} from "@/services/delivery/routeAccess";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		const shipment = await withTransaction(
			ctx.payload,
			async (req) => {
				const { shipment: current } = await requireShopShipment(
					ctx.payload,
					ctx.user,
					parsed.data.id,
					"orders.process",
					req,
				);
				return startShipment(req, current, {
					type: "seller",
					id: ctx.user.id,
				});
			},
			{ user: ctx.user },
		);
		return Response.json(shipmentActionResult(shipment));
	} catch (error) {
		return handleServiceError("shipments:start", error);
	}
}
