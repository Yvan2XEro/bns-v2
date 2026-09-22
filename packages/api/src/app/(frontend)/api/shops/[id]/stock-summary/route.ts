import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { stockSummary } from "@/services/stock";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;
	try {
		return Response.json(await stockSummary(ctx.payload, ctx.user, id));
	} catch (error) {
		return handleServiceError("stock:summary", error);
	}
}
