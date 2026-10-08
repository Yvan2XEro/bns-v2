import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import {
	createLocation,
	listShopLocations,
} from "@/services/delivery/locations";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await listShopLocations(ctx.payload, ctx.user, parsed.data.id),
		);
	} catch (error) {
		return handleServiceError("shopLocations:list", error);
	}
}

export async function POST(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await createLocation(
				ctx.payload,
				ctx.user,
				parsed.data.id,
				await readBody(request),
			),
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("shopLocations:create", error);
	}
}
