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
/**
 * Level 2 under manual review only: the consent given on the upload screen.
 * Every other submit sends no body at all.
 */
const bodySchema = z
	.object({
		consentVersion: z.string().trim().min(1).max(64),
		locale: z.enum(["fr", "en"]),
	})
	.optional();

async function readBody(request: Request): Promise<unknown> {
	const text = await request.text().catch(() => "");
	if (!text.trim()) return undefined;
	try {
		const parsed: unknown = JSON.parse(text);
		// The app has always posted `{}` here: that is "no consent", not a
		// malformed one.
		if (
			parsed &&
			typeof parsed === "object" &&
			!Array.isArray(parsed) &&
			Object.keys(parsed).length === 0
		) {
			return undefined;
		}
		return parsed;
	} catch {
		return null;
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const parsedBody = bodySchema.safeParse(await readBody(request));
	if (!parsedBody.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const settings = await getVerificationSettings(ctx.payload);
	if (!settings.enabled)
		return errorResponse(ERROR_CODES.verificationDisabled, 403);

	try {
		const existing = await loadOwnedRequest(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
		);
		const name: TransitionName =
			existing.status === "needs_info" ? "resubmit" : "submit";
		if (!canTransition(name, existing.status)) {
			throw new ServiceError(ERROR_CODES.verificationInvalidTransition, 409);
		}

		// Level 3 here; a level-2 request is either the vendor's KYC result or,
		// under manual review, the `identity_*` documents `submitRequest` checks.
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
			{ identity: parsedBody.data },
		);
		const documents = await documentsFor(ctx.payload, String(updated.id));
		return Response.json(toOwnerRequest(updated, documents));
	} catch (error) {
		return handleServiceError("verification:submit", error);
	}
}
