import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import {
	deactivateLocation,
	updateLocation,
} from "@/services/delivery/locations";

const paramsSchema = z.object({ locationId: z.string().trim().min(1) });
type Params = { params: Promise<{ locationId: string }> };

export async function PATCH(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await updateLocation(
				ctx.payload,
				ctx.user,
				parsed.data.locationId,
				await readBody(request),
			),
		);
	} catch (error) {
		return handleServiceError("shopLocations:update", error);
	}
}

export async function DELETE(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await deactivateLocation(ctx.payload, ctx.user, parsed.data.locationId),
		);
	} catch (error) {
		return handleServiceError("shopLocations:delete", error);
	}
}
