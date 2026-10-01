import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { INBOX_FILTERS } from "@/lib/inboxFilters";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listShopInbox } from "@/services/inbox";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const querySchema = z.object({
	filter: z.enum(INBOX_FILTERS).optional(),
	q: z.string().trim().max(120).optional(),
	cursor: z.string().datetime().optional(),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const search = new URL(request.url).searchParams;
	const query = querySchema.safeParse({
		filter: search.get("filter") ?? undefined,
		q: search.get("q") ?? undefined,
		cursor: search.get("cursor") ?? undefined,
	});
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await listShopInbox(ctx.payload, ctx.user, parsed.data.id, query.data),
		);
	} catch (error) {
		return handleServiceError("inbox:list", error);
	}
}
