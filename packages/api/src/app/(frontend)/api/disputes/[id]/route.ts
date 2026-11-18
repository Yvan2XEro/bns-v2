import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getDisputeView } from "@/services/disputeViews";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	if (!id.trim()) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(await getDisputeView(ctx.payload, ctx.user, id));
	} catch (error) {
		return handleServiceError("disputes:get", error);
	}
}
