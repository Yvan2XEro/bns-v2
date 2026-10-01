import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { isChatServiceAccount } from "@/lib/serviceAccounts";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { markConversationRead } from "@/services/inbox";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	lastMessageId: z.string().trim().min(1),
	userId: z.string().trim().min(1).optional(),
});

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
			await markConversationRead(
				ctx.payload,
				{
					id: ctx.user.id,
					isService: isChatServiceAccount(
						ctx.user as { email?: string | null },
					),
				},
				parsed.data.id,
				body.data,
			),
		);
	} catch (error) {
		return handleServiceError("inbox:read", error);
	}
}
