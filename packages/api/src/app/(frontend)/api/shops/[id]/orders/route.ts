import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { SHOP_ORDER_TABS } from "@/lib/orderFormat";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listShopOrders } from "@/services/orders/queries";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/**
 * `tab` is required and must be one of the six tabs: an unknown or missing
 * value fails here, as a plain `generic.badRequest`, never a silent
 * "every status" fallback.
 */
const querySchema = z.object({
	tab: z.enum(SHOP_ORDER_TABS),
	q: z.string().trim().min(1).max(120).optional(),
	cursor: z.string().datetime().optional(),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const search = new URL(request.url).searchParams;
	const query = querySchema.safeParse({
		tab: search.get("tab") ?? undefined,
		q: search.get("q") ?? undefined,
		cursor: search.get("cursor") ?? undefined,
	});
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		return Response.json(
			await listShopOrders(ctx.payload, ctx.user, parsedParams.data.id, {
				tab: query.data.tab,
				q: query.data.q,
				cursor: query.data.cursor,
			}),
		);
	} catch (error) {
		return handleServiceError("shop:orders", error);
	}
}
