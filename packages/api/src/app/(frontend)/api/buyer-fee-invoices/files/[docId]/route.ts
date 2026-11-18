import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { buyerFeeInvoiceFilesDir } from "@/collections/BuyerFeeInvoiceFiles";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { verifyLocalFileToken } from "@/lib/privateFiles";

const paramsSchema = z.object({ docId: z.string().trim().min(1) });
const querySchema = z.object({
	exp: z.coerce.number(),
	sig: z.string().trim().min(1),
});

/**
 * The local storage provider's door to a fee invoice PDF, the twin of
 * `/api/verification/files`. The signature is the whole authorisation: the
 * download route minted it after checking the caller.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ docId: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const url = new URL(request.url);
	const parsedQuery = querySchema.safeParse({
		exp: url.searchParams.get("exp") ?? undefined,
		sig: url.searchParams.get("sig") ?? undefined,
	});
	if (!parsedQuery.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const { docId } = parsedParams.data;
	const { exp, sig } = parsedQuery.data;
	if (!verifyLocalFileToken(docId, exp, sig)) {
		return errorResponse(ERROR_CODES.forbidden, 403);
	}

	const payload = await getPayload({ config });
	const doc = await payload
		.findByID({
			collection: "buyer-fee-invoice-files",
			id: docId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!doc?.filename) return errorResponse(ERROR_CODES.notFound, 404);

	const file = path.join(
		buyerFeeInvoiceFilesDir(),
		path.basename(doc.filename),
	);
	const info = await stat(file).catch(() => null);
	if (!info?.isFile()) return errorResponse(ERROR_CODES.notFound, 404);

	return new Response(await readFile(file), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Length": String(info.size),
			"Content-Disposition": "inline",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
