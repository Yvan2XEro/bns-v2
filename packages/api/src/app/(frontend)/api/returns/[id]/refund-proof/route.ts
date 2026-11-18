import { z } from "zod";
import { returnRefundProofInputSchema } from "@/contracts/returnInputs";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { submitRefundProof } from "@/services/returnRefunds";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = returnRefundProofInputSchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const kase = await submitRefundProof(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			body.data,
		);
		return Response.json({ id: String(kase.id), refund: kase.refund });
	} catch (error) {
		return handleServiceError("return:refund-proof", error);
	}
}
