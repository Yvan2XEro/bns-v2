import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { withdrawDispute } from "@/services/disputeActions";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	if (!id.trim()) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		const dispute = await withdrawDispute(ctx.payload, ctx.user, id);
		return Response.json({ id: String(dispute.id), status: dispute.status });
	} catch (error) {
		return handleServiceError("disputes:withdraw", error);
	}
}
