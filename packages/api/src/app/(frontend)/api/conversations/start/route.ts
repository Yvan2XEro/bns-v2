import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { startConversation } from "@/services/inbox";

const bodySchema = z.object({ listingId: z.string().trim().min(1) });

export async function POST(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await startConversation(ctx.payload, ctx.user, body.data.listingId),
		);
	} catch (error) {
		return handleServiceError("inbox:start", error);
	}
}
