import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import {
	createRiderLink,
	revokeRiderLink,
} from "@/services/delivery/riderLinks";
import { requireShopShipment } from "@/services/delivery/routeAccess";

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
		const result = await withTransaction(
			ctx.payload,
			async (req) => {
				const { shipment } = await requireShopShipment(
					ctx.payload,
					ctx.user,
					parsed.data.id,
					"orders.process",
					req,
				);
				return createRiderLink(req, shipment, ctx.user.id);
			},
			{ user: ctx.user },
		);
		return Response.json({ url: result.url }, { status: 201 });
	} catch (error) {
		return handleServiceError("shipments:rider-link-create", error);
	}
}

export async function DELETE(
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
				return revokeRiderLink(req, current, ctx.user.id);
			},
			{ user: ctx.user },
		);
		return Response.json({ id: String(shipment.id), revoked: true });
	} catch (error) {
		return handleServiceError("shipments:rider-link-revoke", error);
	}
}
