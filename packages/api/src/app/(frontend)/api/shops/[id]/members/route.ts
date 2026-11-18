import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getShopTeam } from "@/services/shopMembers";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await getShopTeam(ctx.payload, ctx.user, parsed.data.id),
		);
	} catch (error) {
		return handleServiceError("team:list", error);
	}
}
