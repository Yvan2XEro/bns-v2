import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { contestRefund } from "@/services/returnRefunds";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		const result = await contestRefund(ctx.payload, ctx.user, parsed.data.id);
		return Response.json(
			{
				returnCaseId: String(result.kase.id),
				returnStatus: result.kase.status,
				disputeId: String(result.dispute.id),
				disputeStatus: result.dispute.status,
			},
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("return:contest-refund", error);
	}
}
