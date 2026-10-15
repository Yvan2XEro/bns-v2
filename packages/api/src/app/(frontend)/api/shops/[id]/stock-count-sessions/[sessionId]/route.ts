import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import {
	cancelStockCount,
	saveStockCountProgress,
} from "@/services/stockCountSessions";

type Params = { params: Promise<{ id: string; sessionId: string }> };

const paramsSchema = z.object({
	id: z.string().trim().min(1),
	sessionId: z.string().trim().min(1),
});
// Shape only; the size and value rules are the service's.
const progressSchema = z.object({
	counts: z.record(z.string(), z.string()),
	locationId: z.string().trim().min(1).nullable().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = progressSchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await saveStockCountProgress(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
				parsedParams.data.sessionId,
				body.data,
			),
		);
	} catch (error) {
		return handleServiceError("stock:count-progress", error);
	}
}

export async function DELETE(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await cancelStockCount(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
				parsedParams.data.sessionId,
			),
		);
	} catch (error) {
		return handleServiceError("stock:count-cancel", error);
	}
}
