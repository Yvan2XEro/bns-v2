import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getOrderReceiptHtml } from "@/services/orders/queries";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const querySchema = z.object({ lang: z.enum(["fr", "en"]).default("fr") });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const search = new URL(request.url).searchParams;
	const query = querySchema.safeParse({
		lang: search.get("lang") ?? undefined,
	});
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const html = await getOrderReceiptHtml(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			query.data.lang,
		);
		return new Response(html, {
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	} catch (error) {
		return handleServiceError("orders:receipt", error);
	}
}
