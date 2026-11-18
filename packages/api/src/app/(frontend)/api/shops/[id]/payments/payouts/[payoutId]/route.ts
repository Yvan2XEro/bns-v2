import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { sellerPayoutDetail } from "@/services/sellerPayments";

const paramsSchema = z.object({
	id: z.string().trim().min(1),
	payoutId: z.string().trim().min(1),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string; payoutId: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		return Response.json(
			await sellerPayoutDetail(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
				parsedParams.data.payoutId,
			),
		);
	} catch (error) {
		return handleServiceError("payments:payout", error);
	}
}
