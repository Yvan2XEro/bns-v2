import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { BULK_PRODUCT_LIMIT, setProductsStatus } from "@/services/productBulk";
import { PRODUCT_STATUSES } from "@/services/products";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

const bodySchema = z.object({
	productIds: z.array(z.string().trim().min(1)).min(1).max(BULK_PRODUCT_LIMIT),
	status: z.enum(PRODUCT_STATUSES),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		return Response.json(
			await setProductsStatus(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
				body.data,
			),
		);
	} catch (error) {
		return handleServiceError("product:bulk-status", error);
	}
}
