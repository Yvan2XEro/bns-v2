import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { decideResaleLink } from "@/services/resaleLinks";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	action: z.enum(["approve", "decline", "suspend", "reinstate", "revoke"]),
	reason: z
		.enum(["quality", "pricing", "fraud_review", "terms", "other"])
		.optional(),
	note: z.string().max(1000).optional(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const link = await decideResaleLink(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			body.data,
		);
		return Response.json(link);
	} catch (error) {
		return handleServiceError("resaleLinks:decision", error);
	}
}
