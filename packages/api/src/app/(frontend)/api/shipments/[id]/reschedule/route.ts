import { z } from "zod";
import { requireOrderAudience } from "@/access/orderAccess";
import { rescheduleShipmentSchema } from "@/lib/delivery/schemas";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { relationId } from "@/lib/relationId";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { rescheduleShipment } from "@/services/delivery/attempts";
import { requireShopShipment } from "@/services/delivery/routeAccess";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = rescheduleShipmentSchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const shipment = await withTransaction(
			ctx.payload,
			async (req) => {
				const initial = await ctx.payload.findByID({
					collection: "shipments",
					id: parsedParams.data.id,
					depth: 0,
					overrideAccess: true,
					req,
				});
				const orderId = relationId(initial.order);
				if (!orderId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
				const { audience } = await requireOrderAudience(
					ctx.payload,
					ctx.user,
					orderId,
					req,
				);
				if (audience.kind === "buyer") {
					return rescheduleShipment(
						req,
						initial,
						body.data,
						"buyer",
						ctx.user.id,
					);
				}
				const { shipment: current } = await requireShopShipment(
					ctx.payload,
					ctx.user,
					parsedParams.data.id,
					"orders.process",
					req,
				);
				if (audience.kind !== "shop") {
					throw new ServiceError(ERROR_CODES.shopForbidden, 403);
				}
				return rescheduleShipment(
					req,
					current,
					body.data,
					"seller",
					ctx.user.id,
				);
			},
			{ user: ctx.user },
		);
		return Response.json({
			id: String(shipment.id),
			status: shipment.status,
			redelivery: shipment.redelivery ?? null,
		});
	} catch (error) {
		return handleServiceError("shipments:reschedule", error);
	}
}
