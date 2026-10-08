import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { assignShopRider } from "@/services/delivery/courierShipments";
import { requireShopShipment } from "@/services/delivery/routeAccess";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.union([
	z.object({ userId: z.string().trim().min(1) }).strict(),
	z
		.object({
			name: z.string().trim().min(1).max(120),
			phone: z.string().trim().min(7).max(30),
		})
		.strict(),
]);

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
				const { shipment } = await requireShopShipment(
					ctx.payload,
					ctx.user,
					parsedParams.data.id,
					"orders.process",
					req,
				);
				return assignShopRider(req, shipment, body.data, ctx.user.id);
			},
			{ user: ctx.user },
		);
		return Response.json({
			id: String(result.id),
			rider: result.rider ?? null,
		});
	} catch (error) {
		return handleServiceError("shipments:assign-rider", error);
	}
}
