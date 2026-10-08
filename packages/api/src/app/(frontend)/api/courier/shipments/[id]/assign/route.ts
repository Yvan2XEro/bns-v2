import { z } from "zod";
import { resolveCourierRole } from "@/access/courierRoles";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { relationId } from "@/lib/relationId";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { assignCourierRider } from "@/services/delivery/courierShipments";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({ riderUserId: z.string().trim().min(1) }).strict();

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const parsedBody = bodySchema.safeParse(await readBody(request));
	if (!parsedBody.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const shipment = await ctx.payload.findByID({
			collection: "shipments",
			id: parsedParams.data.id,
			depth: 0,
			overrideAccess: true,
		});
		const courierId = relationId(shipment.courier);
		if (
			!courierId ||
			(await resolveCourierRole(ctx.payload, ctx.user.id, courierId)) !==
				"dispatcher"
		) {
			return errorResponse(ERROR_CODES.shipmentNotAssigned, 403);
		}
		const updated = await withTransaction(
			ctx.payload,
			(req) =>
				assignCourierRider(
					req,
					shipment,
					parsedBody.data.riderUserId,
					ctx.user.id,
				),
			{ user: ctx.user },
		);
		return Response.json({
			id: String(updated.id),
			rider: updated.rider ?? null,
		});
	} catch (error) {
		return handleServiceError("courier:assign-rider", error);
	}
}
