import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { acceptResaleTerms } from "@/services/resale";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	role: z.enum(["supplier", "reseller"]),
	version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	locale: z.enum(["fr", "en"]),
	client: z.enum(["web", "ios", "android"]),
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
		const acceptance = await acceptResaleTerms(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			body.data,
		);
		return Response.json(acceptance, { status: 201 });
	} catch (error) {
		return handleServiceError("resaleTerms:accept", error);
	}
}
