import { z } from "zod";
import { reportAttemptSchema } from "@/lib/delivery/schemas";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { reportAttempt } from "@/services/delivery/attempts";
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
	const body = reportAttemptSchema.safeParse(await readBody(request));
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
				return reportAttempt(req, current, body.data, {
					type: "seller",
					id: ctx.user.id,
					shopRole: role,
				});
			},
			{ user: ctx.user },
		);
		return Response.json({
			id: String(shipment.id),
			status: shipment.status,
			attempts: shipment.attempts ?? [],
			redelivery: shipment.redelivery ?? null,
			finalFailure: shipment.finalFailure ?? null,
		});
	} catch (error) {
		return handleServiceError("shipments:attempt", error);
	}
}
