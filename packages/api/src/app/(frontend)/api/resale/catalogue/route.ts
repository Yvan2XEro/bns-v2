import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listResaleCatalogue } from "@/services/resaleCatalogue";

const querySchema = z.object({
	shop: z.string().trim().min(1),
	q: z.string().trim().max(120).optional(),
	category: z.string().trim().min(1).optional(),
	supplier: z.string().trim().min(1).optional(),
});

export async function GET(request: Request) {
	const params = querySchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams.entries()),
	);
	if (!params.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const required = await requireUser(request);
	if (required instanceof Response) return required;
	try {
		const result = await listResaleCatalogue(
			required.payload,
			required.user,
			params.data.shop,
			{
				query: params.data.q,
				categoryId: params.data.category,
				supplierShopId: params.data.supplier,
			},
		);
		return Response.json(result, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		return handleServiceError("resale:catalogue", error);
	}
}
