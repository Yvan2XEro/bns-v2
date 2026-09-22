import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { listCatalogue } from "@/services/catalogue";
import { createProduct, PRODUCT_STATUSES } from "@/services/products";

type Params = { params: Promise<{ id: string }> };

const paramsSchema = z.object({ id: z.string().trim().min(1) });

const catalogueQuerySchema = z.object({
	status: z.enum(PRODUCT_STATUSES).optional(),
	stock: z.enum(["low", "out"]).optional(),
	q: z.string().trim().max(120).optional(),
	page: z.coerce.number().int().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const search = new URL(request.url).searchParams;
	const parsedQuery = catalogueQuerySchema.safeParse({
		status: search.get("status") ?? undefined,
		stock: search.get("stock") ?? undefined,
		q: search.get("q") ?? undefined,
		page: search.get("page") ?? undefined,
		limit: search.get("limit") ?? undefined,
	});
	if (!parsedQuery.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		return Response.json(
			await listCatalogue(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
				parsedQuery.data,
			),
		);
	} catch (error) {
		return handleServiceError("catalogue", error);
	}
}

export async function POST(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await createProduct(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
				await readBody(request),
			),
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("product:create", error);
	}
}
