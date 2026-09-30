import { z } from "zod";
import {
	BUSINESS_TYPES,
	VERIFICATION_SERVICE_CONTEXT,
} from "@/collections/VerificationRequests";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { ServiceError } from "@/lib/serviceError";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { getVerificationSettings } from "@/lib/verificationSettings";
import {
	documentsFor,
	loadOwnedRequest,
	toOwnerRequest,
} from "@/lib/verificationView";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/** A business registration number, trimmed and stripped of internal whitespace before it is stored. */
const registrationNumber = z
	.string()
	.trim()
	.regex(/^[A-Z0-9/.\- ]{8,40}$/i)
	.nullish()
	.transform((value) =>
		value ? value.replace(/\s+/g, "").toUpperCase() : value,
	);

const businessSchema = z
	.object({
		businessType: z.enum(BUSINESS_TYPES),
		legalName: z.string().trim().min(2).max(120),
		tradeName: z.string().trim().max(120).nullish(),
		rccmNumber: registrationNumber,
		entreprenantDeclarationNumber: registrationNumber,
		niu: z
			.string()
			.trim()
			.regex(/^[A-Za-z0-9]{14}$/),
		registeredAddress: z.string().trim().min(1).max(500),
		city: z.string().trim().min(1).max(80),
		legalRepresentativeName: z.string().trim().min(2).max(120),
		legalRepresentativeIsOwner: z.boolean(),
	})
	.refine(
		(v) =>
			v.businessType === "entreprenant"
				? Boolean(v.entreprenantDeclarationNumber)
				: Boolean(v.rccmNumber),
		{ message: "registration number required", path: ["rccmNumber"] },
	);

/** A request stays editable by its seller while it is a draft or answering a reviewer's request for more. */
const EDITABLE_STATUSES = ["draft", "needs_info"] as const;

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

	const body = await readBody(request);
	const parsedBody = businessSchema.safeParse(body);
	if (!parsedBody.success) {
		return errorResponse(ERROR_CODES.verificationFieldsInvalid, 400);
	}

	try {
		const existing = await loadOwnedRequest(
			ctx.payload,
			ctx.user.id,
			parsedParams.data.id,
		);
		if (existing.requestedLevel !== 3) {
			throw new ServiceError(ERROR_CODES.verificationInvalidTransition, 409);
		}
		if (!(EDITABLE_STATUSES as readonly string[]).includes(existing.status)) {
			throw new ServiceError(ERROR_CODES.verificationInvalidTransition, 409);
		}

		await withTransaction(
			ctx.payload,
			async (req) => {
				await ctx.payload.update({
					collection: "verification-requests",
					id: existing.id,
					req,
					overrideAccess: true,
					context: VERIFICATION_SERVICE_CONTEXT,
					data: { business: parsedBody.data },
				});
			},
			{ user: ctx.user },
		);

		const updated = await loadOwnedRequest(
			ctx.payload,
			ctx.user.id,
			parsedParams.data.id,
		);
		const documents = await documentsFor(ctx.payload, String(updated.id));
		return Response.json(toOwnerRequest(updated, documents));
	} catch (error) {
		return handleServiceError("verification:business", error);
	}
}
