import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { paymentSetupView } from "@/services/connectedAccounts";
import { findShop } from "@/services/shopGuards";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const shop = await findShop(ctx.payload, parsedParams.data.id);
		return Response.json(await paymentSetupView(ctx.payload, shop, ctx.user));
	} catch (error) {
		return handleServiceError("payments:setup", error);
	}
}
