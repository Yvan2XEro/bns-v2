import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { deactivateZone, updateZone } from "@/services/delivery/zones";

const paramsSchema = z.object({ zoneId: z.string().trim().min(1) });
type Params = { params: Promise<{ zoneId: string }> };

export async function PATCH(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await updateZone(
				ctx.payload,
				ctx.user,
				parsed.data.zoneId,
				await readBody(request),
			),
		);
	} catch (error) {
		return handleServiceError("deliveryZones:update", error);
	}
}

export async function DELETE(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await deactivateZone(ctx.payload, ctx.user, parsed.data.zoneId),
		);
	} catch (error) {
		return handleServiceError("deliveryZones:delete", error);
	}
}
