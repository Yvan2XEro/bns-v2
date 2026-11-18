import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { setConversationStatus } from "@/services/inbox";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({ status: z.enum(["open", "done"]) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await setConversationStatus(
				ctx.payload,
				ctx.user,
				parsed.data.id,
				body.data.status,
			),
		);
	} catch (error) {
		return handleServiceError("inbox:status", error);
	}
}
