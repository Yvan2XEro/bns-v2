import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listReturnCases, RETURN_CASE_STATUS_NAMES } from "@/services/returns";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const querySchema = z.object({
	status: z.enum(RETURN_CASE_STATUS_NAMES).optional(),
	overdue: z.enum(["true", "false"]).optional(),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const url = new URL(request.url);
	const query = querySchema.safeParse({
		status: url.searchParams.get("status") ?? undefined,
		overdue: url.searchParams.get("overdue") ?? undefined,
	});
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await listReturnCases(ctx.payload, ctx.user, {
				shopId: parsedParams.data.id,
				status: query.data.status,
				overdue: query.data.overdue === "true",
			}),
		);
	} catch (error) {
		return handleServiceError("returns:shop-list", error);
	}
}
