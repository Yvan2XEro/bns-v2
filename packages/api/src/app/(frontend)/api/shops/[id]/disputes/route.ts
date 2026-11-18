import { z } from "zod";
import { DISPUTE_STATUSES } from "@/collections/Disputes";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listDisputes } from "@/services/disputes";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const querySchema = z.object({
	status: z.enum(DISPUTE_STATUSES).optional(),
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
	const query = querySchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams),
	);
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await listDisputes(ctx.payload, ctx.user, {
				shopId: parsedParams.data.id,
				status: query.data.status,
				overdue: query.data.overdue === "true",
			}),
		);
	} catch (error) {
		return handleServiceError("disputes:shop-list", error);
	}
}
