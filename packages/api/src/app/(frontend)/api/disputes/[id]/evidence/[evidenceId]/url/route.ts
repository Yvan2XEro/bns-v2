import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { evidenceUrl } from "@/services/disputeEvidence";

const paramsSchema = z.object({
	id: z.string().trim().min(1),
	evidenceId: z.string().trim().min(1),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string; evidenceId: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await evidenceUrl(ctx.payload, ctx.user, parsed.data.evidenceId, {
				userAgent: request.headers.get("user-agent") ?? undefined,
			}, parsed.data.id),
		);
	} catch (error) {
		return handleServiceError("dispute:evidence-url", error);
	}
}
