import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { createZone, listShopZones } from "@/services/delivery/zones";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await listShopZones(ctx.payload, ctx.user, parsed.data.id),
		);
	} catch (error) {
		return handleServiceError("deliveryZones:list", error);
	}
}

export async function POST(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await createZone(
				ctx.payload,
				ctx.user,
				parsed.data.id,
				await readBody(request),
			),
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("deliveryZones:create", error);
	}
}
