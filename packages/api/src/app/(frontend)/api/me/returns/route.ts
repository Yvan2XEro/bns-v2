import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listReturnCases, RETURN_CASE_STATUS_NAMES } from "@/services/returns";

const querySchema = z.object({
	status: z.enum(RETURN_CASE_STATUS_NAMES).optional(),
});

export async function GET(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const query = querySchema.safeParse({
		status: new URL(request.url).searchParams.get("status") ?? undefined,
	});
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await listReturnCases(ctx.payload, ctx.user, query.data),
		);
	} catch (error) {
		return handleServiceError("returns:me-list", error);
	}
}
