import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { buyerFeeInvoiceDownload } from "@/services/buyerFeeInvoices";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/** A 5-minute signed URL to a buyer fee invoice or credit note PDF. */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const signed = await buyerFeeInvoiceDownload(
			ctx.payload,
			ctx.user,
			parsed.data.id,
		);
		return Response.json(
			{ url: signed.url, expiresAt: signed.expiresAt.toISOString() },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		return handleServiceError("buyer-fee-invoices:download", error);
	}
}
