import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { isChatServiceAccount } from "@/lib/serviceAccounts";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { inboxMemberIds } from "@/services/shopMembers";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/**
 * chat-service only — not admins, not moderators. It answers with the set of
 * users the socket layer treats as "the shop side", which is an access
 * decision, not information anyone else has a reason to read in bulk.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	if (!isChatServiceAccount(ctx.user as { email?: string | null })) {
		return errorResponse(ERROR_CODES.forbidden, 403);
	}
	try {
		return Response.json({
			userIds: await inboxMemberIds(ctx.payload, parsed.data.id),
		});
	} catch (error) {
		return handleServiceError("inbox:members", error);
	}
}
