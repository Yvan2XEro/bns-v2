import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listSupplierResaleProducts } from "@/services/resaleSupplier";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const context = await requireUser(request);
	if (context instanceof Response) return context;
	try {
		const products = await listSupplierResaleProducts(
			context.payload,
			context.user,
			parsedParams.data.id,
		);
		return Response.json(
			{ products },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch (error) {
		return handleServiceError("resaleSupplier:offered", error);
	}
}
