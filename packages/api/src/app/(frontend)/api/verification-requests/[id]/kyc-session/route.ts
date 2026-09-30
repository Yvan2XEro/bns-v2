import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { getVerificationSettings } from "@/lib/verificationSettings";
import { startKycSession } from "@/services/verification";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	consentVersion: z.string().trim().min(1),
	locale: z.enum(["fr", "en"]),
});

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
	const parsedBody = bodySchema.safeParse(body);
	if (!parsedBody.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const session = await startKycSession(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			parsedBody.data,
		);
		return Response.json(session);
	} catch (error) {
		return handleServiceError("verification:kyc-session", error);
	}
}
