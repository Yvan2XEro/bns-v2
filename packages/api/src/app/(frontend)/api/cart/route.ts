import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { clearCart, getCartView } from "@/services/cart";

export async function GET(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(await getCartView(ctx.payload, ctx.user));
	} catch (error) {
		return handleServiceError("cart:get", error);
	}
}

export async function DELETE(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(await clearCart(ctx.payload, ctx.user));
	} catch (error) {
		return handleServiceError("cart:clear", error);
	}
}
