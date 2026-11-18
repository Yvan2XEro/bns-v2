import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { readJsonBody } from "@/lib/readJsonBody";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { startOnboarding } from "@/services/connectedAccounts";
import { findShop } from "@/services/shopGuards";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	platform: z.enum(["web", "mobile"]).default("web"),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readJsonBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.validation, 400);

	try {
		const shop = await findShop(ctx.payload, parsedParams.data.id);
		return Response.json(
			await startOnboarding(ctx.payload, ctx.user, shop, {
				platform: body.data.platform,
			}),
		);
	} catch (error) {
		return handleServiceError("payments:onboarding", error);
	}
}
