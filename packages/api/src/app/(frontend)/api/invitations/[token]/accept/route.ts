import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { acceptInvitation } from "@/services/shopMembers";

const paramsSchema = z.object({ token: z.string().trim().min(1).max(128) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await acceptInvitation(ctx.payload, ctx.user, parsed.data.token),
		);
	} catch (error) {
		return handleServiceError("invitation:accept", error);
	}
}
