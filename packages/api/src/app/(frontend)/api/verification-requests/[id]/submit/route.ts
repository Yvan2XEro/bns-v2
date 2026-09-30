import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getVerificationSettings } from "@/lib/verificationSettings";
import {
	canTransition,
	type TransitionName,
} from "@/lib/verificationTransitions";
import {
	documentsFor,
	loadOwnedRequest,
	toOwnerRequest,
} from "@/lib/verificationView";
import { submitRequest } from "@/services/verification";
import { missingDocumentKinds } from "@/services/verificationDocuments";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const settings = await getVerificationSettings(ctx.payload);
	if (!settings.enabled)
		return errorResponse(ERROR_CODES.verificationDisabled, 403);

	try {
		const existing = await loadOwnedRequest(
			ctx.payload,
			ctx.user.id,
			parsedParams.data.id,
		);
		const name: TransitionName =
			existing.status === "needs_info" ? "resubmit" : "submit";
		if (!canTransition(name, existing.status)) {
			throw new ServiceError(ERROR_CODES.verificationInvalidTransition, 409);
		}

		// Level 3 only: a level-2 request's completeness is the vendor's KYC
		// result, not a set of uploaded documents. See services/verificationDocuments.ts.
		if (existing.requestedLevel === 3) {
			const documents = await documentsFor(ctx.payload, String(existing.id));
			const missing = missingDocumentKinds(
				{
					businessType: existing.business?.businessType ?? null,
					legalRepresentativeIsOwner:
						existing.business?.legalRepresentativeIsOwner ?? true,
				},
				documents,
			);
			if (missing.length > 0) {
				throw new ServiceError(ERROR_CODES.verificationDocumentsMissing, 409);
			}
		}

		const updated = await submitRequest(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
		);
		const documents = await documentsFor(ctx.payload, String(updated.id));
		return Response.json(toOwnerRequest(updated, documents));
	} catch (error) {
		return handleServiceError("verification:submit", error);
	}
}
