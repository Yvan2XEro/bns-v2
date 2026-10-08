import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { answerProposal } from "@/services/disputeActions";

const bodySchema = z.object({ action: z.enum(["accept", "reject"]) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	if (!id.trim()) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const dispute = await answerProposal(
			ctx.payload,
			ctx.user,
			id,
			parsed.data.action,
		);
		return Response.json({ id: String(dispute.id), status: dispute.status });
	} catch (error) {
		return handleServiceError("disputes:proposal", error);
	}
}
