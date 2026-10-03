import { z } from "zod";
import { PAYOUT_METHODS } from "@/collections/PayoutAccounts";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { submitPayoutAccount } from "@/services/payoutAccounts";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

const bodySchema = z
	.object({
		method: z.enum(PAYOUT_METHODS),
		accountName: z.string().trim().min(2).max(80),
		accountNumber: z.string().trim().min(1).max(40),
	})
	.strict();

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.validation, 400);

	try {
		const account = await submitPayoutAccount(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			body.data,
		);
		return Response.json(account, { status: 201 });
	} catch (error) {
		return handleServiceError("payoutAccounts:create", error);
	}
}
