import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import { relationId } from "@/lib/relationId";
import { claimRiskFlag } from "@/services/riskFlagQueue";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const flag = await claimRiskFlag(ctx.payload, ctx.actor, parsed.data.id);
		return Response.json({
			id: String(flag.id),
			assignedTo: relationId(flag.assignedTo) ?? ctx.actor.id,
		});
	} catch (error) {
		return handleModerationError("risk-flags:claim", error);
	}
}
