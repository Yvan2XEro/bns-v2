import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { confirmRefund } from "@/services/returnRefunds";

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
		const kase = await confirmRefund(ctx.payload, ctx.user, parsed.data.id);
		return Response.json({ id: String(kase.id), status: kase.status });
	} catch (error) {
		return handleServiceError("return:confirm-refund", error);
	}
}
