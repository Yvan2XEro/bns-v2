import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { recordStockCount } from "@/services/stock";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

// Shape only: how many lines are allowed and whether a count is non-negative
// stay the service's business rules (`recordStockCount`'s own parsing).
const bodySchema = z.object({
	counts: z.array(z.object({ variantId: z.string(), counted: z.number() })),
	note: z.string().nullable().optional(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = await readBody(request);
	const parsedBody = bodySchema.safeParse(body);
	if (!parsedBody.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		return Response.json(
			await recordStockCount(ctx.payload, ctx.user, parsedParams.data.id, {
				counts: body.counts,
				note: body.note,
			}),
		);
	} catch (error) {
		return handleServiceError("stock:count", error);
	}
}
