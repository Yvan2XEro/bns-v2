import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listCourierShipments } from "@/services/delivery/courierShipments";

const querySchema = z.object({
	status: z
		.enum([
			"pending",
			"picked_up",
			"in_transit",
			"delivered",
			"failed",
			"returned",
		])
		.optional(),
	cursor: z.string().trim().min(1).optional(),
});

export async function GET(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const parsed = querySchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams),
	);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const result = await listCourierShipments(
			ctx.payload,
			ctx.user.id,
			parsed.data,
		);
		return Response.json({
			rows: result.docs.map((shipment) => ({
				id: String(shipment.id),
				shipmentNumber: shipment.shipmentNumber,
				status: shipment.status,
				courierId:
					typeof shipment.courier === "string" ? shipment.courier : null,
				origin: shipment.origin,
				destination: shipment.destination,
				codCollection: shipment.codCollection ?? null,
				rider: shipment.rider ?? null,
			})),
			nextCursor: result.nextCursor,
		});
	} catch (error) {
		return handleServiceError("courier:shipments", error);
	}
}
