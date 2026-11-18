import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { documentsFor, toOwnerRequest } from "@/lib/verificationView";
import { openRequest } from "@/services/verification";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({ level: z.union([z.literal(2), z.literal(3)]) });

/**
 * Idempotent by design: `openRequest` returns the shop's existing open
 * request for this level rather than refusing, so a second call answers 200
 * with the same draft instead of an error.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = await readBody(request);
	const parsedBody = bodySchema.safeParse(body);
	if (!parsedBody.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const created = await openRequest(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			parsedBody.data.level,
		);
		const documents = await documentsFor(ctx.payload, String(created.id));
		return Response.json(toOwnerRequest(created, documents));
	} catch (error) {
		return handleServiceError("verification:open", error);
	}
}
