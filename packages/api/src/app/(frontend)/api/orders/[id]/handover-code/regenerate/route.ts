import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { requireOrderBuyer } from "@/services/orders/delivery";
import { issueHandoverCode } from "@/services/orders/handover";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/**
 * The buyer's own fallback when the code they were sent no longer works —
 * typically after a lock. `issueHandoverCode` is where the three-regeneration
 * budget actually lives (Task 13); this route does not re-check it, it only
 * forwards whatever `issueHandoverCode` decides.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const order = await requireOrderBuyer(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
		);
		if (order.status !== "shipped") {
			throw new ServiceError(ERROR_CODES.orderInvalidTransition, 409);
		}

		const { code } = await withTransaction(
			ctx.payload,
			(req) => issueHandoverCode(req, order, { regenerate: true }),
			{ user: ctx.user },
		);

		return Response.json({ code });
	} catch (error) {
		return handleServiceError("orders:handover-code-regenerate", error);
	}
}
