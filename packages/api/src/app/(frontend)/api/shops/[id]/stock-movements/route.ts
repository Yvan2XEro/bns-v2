import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listMovements } from "@/services/stock";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;
	const search = new URL(request.url).searchParams;
	const page = Number.parseInt(search.get("page") ?? "1", 10);
	const limit = Number.parseInt(search.get("limit") ?? "20", 10);
	try {
		return Response.json(
			await listMovements(ctx.payload, ctx.user, id, {
				variant: search.get("variant"),
				type: search.get("type"),
				from: search.get("from"),
				page: Number.isFinite(page) ? page : 1,
				limit: Number.isFinite(limit) ? limit : 20,
			}),
		);
	} catch (error) {
		return handleServiceError("stock:list", error);
	}
}
