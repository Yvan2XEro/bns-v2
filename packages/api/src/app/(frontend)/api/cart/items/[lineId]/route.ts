import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { removeCartItem, setCartItemQuantity } from "@/services/cart";

type Params = { params: Promise<{ lineId: string }> };

const paramsSchema = z.object({ lineId: z.string().trim().min(1) });
// Shape only: the 1-20 bound stays `setCartItemQuantity`'s own business rule.
const bodySchema = z.object({ quantity: z.number() });

export async function PATCH(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		return Response.json(
			await setCartItemQuantity(
				ctx.payload,
				ctx.user,
				parsedParams.data.lineId,
				body.data.quantity,
			),
		);
	} catch (error) {
		return handleServiceError("cart:items:quantity", error);
	}
}

export async function DELETE(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		return Response.json(
			await removeCartItem(ctx.payload, ctx.user, parsedParams.data.lineId),
		);
	} catch (error) {
		return handleServiceError("cart:items:remove", error);
	}
}
