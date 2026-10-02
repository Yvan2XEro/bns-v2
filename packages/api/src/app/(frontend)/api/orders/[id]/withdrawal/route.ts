import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { openWithdrawal } from "@/services/orders/withdrawal";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

// Shape only: ownership, the order's status, the withdrawal window and
// each item's quantity against its own line are the service's business
// rules (`openWithdrawal`'s own checks).
const bodySchema = z.object({
	items: z
		.array(
			z.object({
				orderItemId: z.string().trim().min(1),
				quantity: z.number().int().min(1),
			}),
		)
		.min(1),
	reasonText: z.string().trim().max(2000).nullable().optional(),
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
			await openWithdrawal(ctx.payload, ctx.user, parsedParams.data.id, {
				items: parsedBody.data.items,
				reasonText: parsedBody.data.reasonText ?? null,
			}),
		);
	} catch (error) {
		return handleServiceError("orders:withdrawal", error);
	}
}
