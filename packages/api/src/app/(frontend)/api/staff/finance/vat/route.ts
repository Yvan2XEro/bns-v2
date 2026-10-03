import { z } from "zod";
import { isAdmin } from "@/access/roles";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { isVatReportMonth, vatReportCsv } from "@/services/vatReport";

const querySchema = z.object({
	month: z.string().trim().refine(isVatReportMonth),
	currency: z
		.string()
		.trim()
		.regex(/^[A-Z]{3}$/)
		.optional(),
});

/** The accountant's monthly `vat_payable` export. Admin only. */
export async function GET(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	if (!isAdmin(ctx.user)) return errorResponse(ERROR_CODES.forbidden, 403);

	const url = new URL(request.url);
	const parsed = querySchema.safeParse({
		month: url.searchParams.get("month") ?? undefined,
		currency: url.searchParams.get("currency") ?? undefined,
	});
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const csv = await vatReportCsv(
			ctx.payload,
			parsed.data.month,
			parsed.data.currency,
		);
		return new Response(csv, {
			headers: {
				"Content-Type": "text/csv; charset=utf-8",
				"Content-Disposition": `attachment; filename="vat-${parsed.data.month}.csv"`,
				"Cache-Control": "no-store",
			},
		});
	} catch (error) {
		return handleServiceError("finance:vat", error);
	}
}
