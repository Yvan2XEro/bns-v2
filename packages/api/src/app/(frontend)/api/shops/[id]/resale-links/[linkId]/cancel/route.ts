import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { cancelResaleLinkRequest } from "@/services/resaleLinks";

const paramsSchema = z.object({
	id: z.string().trim().min(1),
	linkId: z.string().trim().min(1),
});

/** The reseller withdraws its own pending request to a supplier. */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string; linkId: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		const link = await cancelResaleLinkRequest(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			parsedParams.data.linkId,
		);
		return Response.json({ id: String(link.id), status: link.status });
	} catch (error) {
		return handleServiceError("resaleLinks:cancel", error);
	}
}
