import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { stockCountSheetHtml } from "@/services/print/stockCountSheet";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const flag = z
	.enum(["0", "1"])
	.optional()
	.transform((value) => value === "1");
const querySchema = z.object({
	lang: z.enum(["fr", "en"]).default("fr"),
	/** Hide the expected stock on the sheet. */
	blind: flag,
	/** Open the print dialog once loaded (the website's button). */
	autoprint: flag,
	/** No on-screen toolbar: the app shows it in a WebView. */
	embed: flag,
});

/**
 * The shop's printable stock count sheet, as a self-contained HTML page:
 * opened by the website (session cookie) and by the app (JWT) alike.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const search = new URL(request.url).searchParams;
	const query = querySchema.safeParse({
		lang: search.get("lang") ?? undefined,
		blind: search.get("blind") ?? undefined,
		autoprint: search.get("autoprint") ?? undefined,
		embed: search.get("embed") ?? undefined,
	});
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const html = await stockCountSheetHtml(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			{
				lang: query.data.lang,
				blind: query.data.blind,
				autoprint: query.data.autoprint,
				embedded: query.data.embed,
			},
		);
		return new Response(html, {
			headers: {
				"content-type": "text/html; charset=utf-8",
				"cache-control": "private, no-store",
			},
		});
	} catch (error) {
		return handleServiceError("print:stock-count", error);
	}
}
