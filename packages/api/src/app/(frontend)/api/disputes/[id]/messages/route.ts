import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { postDisputeMessage } from "@/services/disputes";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	body: z.string().trim().min(1).max(2000),
	evidenceIds: z.array(z.string().trim().min(1)).max(5).optional(),
	visibility: z.enum(["parties", "staff"]).optional(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const message = await postDisputeMessage(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			body.data,
		);
		return Response.json(message, { status: 201 });
	} catch (error) {
		return handleServiceError("dispute:message", error);
	}
}
