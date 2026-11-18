import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { reportPayoutAccountNotMe } from "@/services/payoutAccounts";

const paramsSchema = z.object({
	id: z.string().trim().min(1),
	accountId: z.string().trim().min(1),
});

type Params = { params: Promise<{ id: string; accountId: string }> };

/** The "This was not me" link target from the payout-account-changed notice. */
export async function POST(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		return Response.json(
			await reportPayoutAccountNotMe(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
				parsedParams.data.accountId,
			),
		);
	} catch (error) {
		return handleServiceError("payoutAccounts:notMe", error);
	}
}
