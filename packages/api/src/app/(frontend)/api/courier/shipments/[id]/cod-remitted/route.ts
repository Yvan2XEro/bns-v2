import { z } from "zod";
import { resolveCourierRole } from "@/access/courierRoles";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { relationId } from "@/lib/relationId";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { appendShipmentEvent } from "@/services/delivery/shipmentTransitions";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z
	.object({ note: z.string().trim().max(300).optional() })
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
		)
			return errorResponse(ERROR_CODES.shipmentNotAssigned, 403);
		const updated = await withTransaction(
			ctx.payload,
			async (req) => {
				const current = await req.payload.findByID({
					collection: "shipments",
					id: parsedParams.data.id,
					depth: 0,
					overrideAccess: true,
					req,
				});
				if (current.codCollection?.remittanceStatus !== "pending") {
					throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
				}
				const occurredAt = new Date().toISOString();
				const next = await req.payload.update({
					collection: "shipments",
					id: String(current.id),
					req,
					overrideAccess: true,
					context: { shipmentService: true },
					data: {
						codCollection: {
							...current.codCollection,
							remittanceStatus: "declared_remitted",
							declaredRemittedAt: occurredAt,
							...(body.data.note ? { note: body.data.note } : {}),
						},
					},
				});
				await appendShipmentEvent(req, next, {
					type: "shipment.cod_remittance_declared",
					actorType: "dispatcher",
					actor: ctx.user.id,
					visibility: "staff",
					occurredAt,
				});
				return next;
			},
			{ user: ctx.user },
		);
		return Response.json({
			id: String(updated.id),
			codCollection: updated.codCollection ?? null,
		});
	} catch (error) {
		return handleServiceError("courier:cod-remitted", error);
	}
}
