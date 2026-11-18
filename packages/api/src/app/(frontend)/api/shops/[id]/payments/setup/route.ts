import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import {
	paymentSetupView,
	queueSyncOnOnboardingReturn,
} from "@/services/connectedAccounts";
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
		const view = await paymentSetupView(ctx.payload, shop, ctx.user);
		// After the view, so only a caller allowed to see it can trigger a sync.
		if (new URL(request.url).searchParams.get("onboarding") === "done") {
			await queueSyncOnOnboardingReturn(ctx.payload, String(shop.id)).catch(
				(error: unknown) =>
					ctx.payload.logger.error(
						{ err: error },
						"[payments:setup] could not queue the onboarding-return sync",
					),
			);
		}
		return Response.json(view);
	} catch (error) {
		return handleServiceError("payments:setup", error);
	}
}
