import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { ORDER_STATUS_NAMES } from "@/lib/orderFormat";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listBuyerOrders } from "@/services/orders/queries";

/**
 * `role` is required rather than inferred from the caller: this route only
 * ever answers as the buyer today, but naming the audience in the query
 * string is what lets a later role be added here without a breaking change
 * to callers that already pin `role=buyer`.
 */
const querySchema = z.object({
	role: z.enum(["buyer"]).default("buyer"),
	status: z.enum(ORDER_STATUS_NAMES).optional(),
	cursor: z.string().datetime().optional(),
});

export async function GET(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const search = new URL(request.url).searchParams;
	const query = querySchema.safeParse({
		role: search.get("role") ?? undefined,
		status: search.get("status") ?? undefined,
		cursor: search.get("cursor") ?? undefined,
	});
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		return Response.json(
			await listBuyerOrders(ctx.payload, ctx.user, {
				status: query.data.status,
				cursor: query.data.cursor,
			}),
		);
	} catch (error) {
		return handleServiceError("orders:list", error);
	}
}
