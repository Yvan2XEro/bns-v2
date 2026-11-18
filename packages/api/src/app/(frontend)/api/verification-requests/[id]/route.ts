import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import {
	documentsFor,
	loadOwnedRequest,
	toOwnerRequest,
} from "@/lib/verificationView";
import { deleteDraft } from "@/services/verification";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/** Reads never consult the feature flag: it gates new intake, not access to a request already open. */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const found = await loadOwnedRequest(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
		);
		const documents = await documentsFor(ctx.payload, String(found.id));
		return Response.json(toOwnerRequest(found, documents));
	} catch (error) {
		return handleServiceError("verification:detail", error);
	}
}

/** Deleting a draft is withdrawal, not intake: it is never gated by the feature flag. */
export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		await deleteDraft(ctx.payload, ctx.user, parsedParams.data.id);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleServiceError("verification:delete", error);
	}
}
