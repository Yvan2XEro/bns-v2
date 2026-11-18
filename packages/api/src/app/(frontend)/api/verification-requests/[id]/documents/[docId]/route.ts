import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { removeDocument } from "@/services/verificationDocuments";

const paramsSchema = z.object({
	id: z.string().trim().min(1),
	docId: z.string().trim().min(1),
});

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ id: string; docId: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		await removeDocument(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			parsedParams.data.docId,
		);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleServiceError("verification:document-delete", error);
	}
}
