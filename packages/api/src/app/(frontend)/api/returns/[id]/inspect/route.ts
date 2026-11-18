import { returnInspectionInputSchema } from "@/contracts/returnInputs";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { inspectReturn } from "@/services/returns";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	if (!id.trim()) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = returnInspectionInputSchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await inspectReturn(ctx.payload, ctx.user, id, body.data),
		);
	} catch (error) {
		return handleServiceError("returns:inspect", error);
	}
}
