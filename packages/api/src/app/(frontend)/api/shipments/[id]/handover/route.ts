import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { handoverShipment } from "@/services/delivery/handover";
import {
	requireShopShipment,
	shipmentActionResult,
} from "@/services/delivery/routeAccess";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const gpsSchema = z.object({
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
	accuracyMeters: z.number().min(0).optional(),
});
const bodySchema = z.object({
	code: z.string().trim().length(4),
	gps: gpsSchema.optional(),
	photoId: z.string().trim().min(1).optional(),
	recipientName: z.string().trim().min(1).max(120).optional(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const shipment = await withTransaction(
			ctx.payload,
			async (req) => {
				const { shipment: current, role } = await requireShopShipment(
					ctx.payload,
					ctx.user,
					parsedParams.data.id,
					"orders.process",
					req,
				);
				return handoverShipment(req, current, body.data, {
					type: "seller",
					id: ctx.user.id,
					shopRole: role,
				});
			},
			{ user: ctx.user },
		);
		return Response.json(shipmentActionResult(shipment));
	} catch (error) {
		return handleServiceError("shipments:handover", error);
	}
}
