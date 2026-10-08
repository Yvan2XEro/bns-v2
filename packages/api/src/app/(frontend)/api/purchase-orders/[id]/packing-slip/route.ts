import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getPurchaseOrderPackingSlipHtml } from "@/services/purchaseOrderPackingSlip";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const querySchema = z.object({ lang: z.enum(["fr", "en"]).default("fr") });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const url = new URL(request.url);
	const query = querySchema.safeParse({
		lang: url.searchParams.get("lang") ?? "fr",
	});
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const context = await requireUser(request);
	if (context instanceof Response) return context;
	try {
		const html = await getPurchaseOrderPackingSlipHtml(
			context.payload,
			context.user,
			parsedParams.data.id,
			query.data.lang,
		);
		return new Response(html, {
			headers: {
				"Cache-Control": "private, no-store",
				"Content-Type": "text/html; charset=utf-8",
			},
		});
	} catch (error) {
		return handleServiceError("purchaseOrders:packing-slip", error);
	}
}
