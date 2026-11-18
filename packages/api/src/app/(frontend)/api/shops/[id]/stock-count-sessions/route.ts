import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import {
	getStockCountOverview,
	startStockCount,
} from "@/services/stockCountSessions";

type Params = { params: Promise<{ id: string }> };

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const startSchema = z.object({
	locationId: z.string().trim().min(1).nullable().optional(),
});

/** The open count, if any, the date of the last finished one and the shop's locations. */
export async function GET(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await getStockCountOverview(ctx.payload, ctx.user, parsedParams.data.id),
		);
	} catch (error) {
		return handleServiceError("stock:count-overview", error);
	}
}

export async function POST(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = startSchema.safeParse((await readBody(request)) ?? {});
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await startStockCount(ctx.payload, ctx.user, parsedParams.data.id, {
				locationId: body.data.locationId ?? null,
			}),
		);
	} catch (error) {
		return handleServiceError("stock:count-start", error);
	}
}
