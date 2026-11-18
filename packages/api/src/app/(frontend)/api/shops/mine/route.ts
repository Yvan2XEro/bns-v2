import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getMyShop } from "@/services/shops";

export async function GET(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		const preferred = new URL(request.url).searchParams.get("shopId");
		return Response.json(
			await getMyShop(ctx.payload, ctx.user, new Date(), preferred),
		);
	} catch (error) {
		return handleServiceError("mine", error);
	}
}
