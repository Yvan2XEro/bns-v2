import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { addCartItem } from "@/services/cart";

// Shape only: whether the quantity is in range stays `addCartItem`'s own
// business rule (`cart.quantityInvalid`), not a zod bound here.
const bodySchema = z.object({
	listingId: z.string().trim().min(1),
	variantId: z.string().trim().min(1),
	quantity: z.number(),
	replace: z.boolean().optional(),
});

export async function POST(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		return Response.json(await addCartItem(ctx.payload, ctx.user, body.data), {
			status: 201,
		});
	} catch (error) {
		return handleServiceError("cart:items:add", error);
	}
}
