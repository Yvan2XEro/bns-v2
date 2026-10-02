import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { payInvoice } from "@/services/commission";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const result = await payInvoice(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
		);
		return Response.json(result);
	} catch (error) {
		return handleServiceError("commission:pay", error);
	}
}
