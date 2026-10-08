import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listShopPurchaseOrders } from "@/services/purchaseOrders";

const querySchema = z.object({
	side: z.enum(["supplier", "reseller"]),
	status: z
		.enum(["sent", "accepted", "shipped", "delivered", "cancelled", "returned"])
		.optional(),
	from: z.string().datetime({ offset: true }).optional(),
	q: z.string().trim().max(100).optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const url = new URL(request.url);
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const context = await requireUser(request);
	if (context instanceof Response) return context;
	const { id } = await params;
	try {
		const result = await listShopPurchaseOrders(
			context.payload,
			context.user,
			id,
			parsed.data,
		);
		return Response.json(result, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		return handleServiceError("shop:purchaseOrders", error);
	}
}
