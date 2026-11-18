import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { revokeInvitation } from "@/services/shopMembers";

type Params = { params: Promise<{ id: string; invId: string }> };

const paramsSchema = z.object({
	id: z.string().trim().min(1),
	invId: z.string().trim().min(1),
});

export async function DELETE(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await revokeInvitation(
				ctx.payload,
				ctx.user,
				parsed.data.id,
				parsed.data.invId,
			),
		);
	} catch (error) {
		return handleServiceError("team:invitation:revoke", error);
	}
}
