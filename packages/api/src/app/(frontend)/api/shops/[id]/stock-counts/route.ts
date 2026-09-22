import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { recordStockCount } from "@/services/stock";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;
	const body = await readBody(request);
	try {
		return Response.json(
			await recordStockCount(ctx.payload, ctx.user, id, {
				counts: body.counts,
				note: body.note,
			}),
		);
	} catch (error) {
		return handleServiceError("stock:count", error);
	}
}
