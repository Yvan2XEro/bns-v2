import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { relationId } from "@/lib/relationId";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { applyShipmentTransition } from "@/services/delivery/shipmentTransitions";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z
	.object({
		gps: z
			.object({
				lat: z.number().min(-90).max(90),
				lng: z.number().min(-180).max(180),
			})
			.strict()
			.optional(),
	})
	.strict();

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
		const result = await withTransaction(
			ctx.payload,
			async (req) => {
				let shipment = await req.payload.findByID({
					collection: "shipments",
					id: parsedParams.data.id,
					depth: 0,
					overrideAccess: true,
					req,
				});
				if (relationId(shipment.rider?.user) !== ctx.user.id)
					throw new ServiceError(ERROR_CODES.shipmentNotAssigned, 403);
				if (shipment.status === "pending") {
					({ shipment } = await applyShipmentTransition(
						req,
						shipment,
						"picked_up",
						{
							type: "shipment.picked_up",
							actorType: "rider",
							actor: ctx.user.id,
							visibility: "both",
							occurredAt: new Date().toISOString(),
							...(body.data.gps ? { metadata: { gps: body.data.gps } } : {}),
						},
					));
				}
				if (shipment.status === "picked_up" || shipment.status === "failed") {
					({ shipment } = await applyShipmentTransition(
						req,
						shipment,
						"in_transit",
						{
							type: "shipment.in_transit",
							actorType: "rider",
							actor: ctx.user.id,
							visibility: "both",
							occurredAt: new Date().toISOString(),
						},
					));
				}
				return shipment;
			},
			{ user: ctx.user },
		);
		return Response.json({ id: String(result.id), status: result.status });
	} catch (error) {
		return handleServiceError("shipments:picked-up", error);
	}
}
