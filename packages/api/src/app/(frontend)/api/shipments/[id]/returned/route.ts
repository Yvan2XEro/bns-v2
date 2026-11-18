import { z } from "zod";
import { returnedShipmentSchema } from "@/lib/delivery/schemas";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { confirmReturned, finalizeFailure } from "@/services/delivery/attempts";
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
	const body = returnedShipmentSchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const shipment = await withTransaction(
			ctx.payload,
			async (req) => {
				const { shipment: current } = await requireShopShipment(
					ctx.payload,
					ctx.user,
					parsedParams.data.id,
					"orders.process",
					req,
				);
				const finalized = current.finalFailure?.at
					? current
					: body.data.reason
						? await finalizeFailure(req, current, body.data.reason)
						: current;
				return confirmReturned(req, finalized, {
					type: "seller",
					id: ctx.user.id,
				});
			},
			{ user: ctx.user },
		);
		return Response.json({
			id: String(shipment.id),
			status: shipment.status,
			returnedAt: shipment.returnedAt ?? null,
		});
	} catch (error) {
		return handleServiceError("shipments:returned", error);
	}
}
