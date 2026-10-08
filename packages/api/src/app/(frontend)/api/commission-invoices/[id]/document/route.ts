import { z } from "zod";
import { renderInvoiceHtml } from "@/lib/commissionInvoiceDocument";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { relationId } from "@/lib/relationId";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import {
	renderCreditNoteDocument,
	resolveInvoiceLineViews,
} from "@/services/commission";
import { requireShopPermission } from "@/services/shopGuards";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const langSchema = z.enum(["fr", "en"]);

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const requestedLang = new URL(request.url).searchParams.get("lang");
	const lang = langSchema.safeParse(requestedLang).success
		? (requestedLang as "fr" | "en")
		: "fr";

	try {
		const invoice = await ctx.payload
			.findByID({
				collection: "commission-invoices",
				id: parsedParams.data.id,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		if (!invoice) {
			throw new ServiceError(ERROR_CODES.commissionInvoiceNotFound, 404);
		}
		const shopId = relationId(invoice.shop);
		if (!shopId) {
			throw new ServiceError(ERROR_CODES.commissionInvoiceNotFound, 404);
		}
		await requireShopPermission(ctx.payload, ctx.user, shopId, "payments.view");

		if (invoice.kind === "credit_note") {
			const pdf = await renderCreditNoteDocument(ctx.payload, invoice);
			return new Response(new Uint8Array(pdf), {
				headers: {
					"Content-Type": "application/pdf",
					"Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
				},
			});
		}

		const lines = await resolveInvoiceLineViews(ctx.payload, invoice);
		const html = renderInvoiceHtml(invoice, lines, lang);
		return new Response(html, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	} catch (error) {
		return handleServiceError("commission:document", error);
	}
}
