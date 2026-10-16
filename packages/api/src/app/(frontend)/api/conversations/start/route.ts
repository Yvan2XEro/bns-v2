import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { getCounterStore, hitRateLimit } from "@/lib/rateLimit";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { startConversation, startShopConversation } from "@/services/inbox";

const bodySchema = z.union([
	z.object({ listingId: z.string().trim().min(1) }),
	z.object({ shopId: z.string().trim().min(1) }),
]);

const START_LIMITS = [
	{ name: "conversation-start-minute", limit: 20, windowSeconds: 60 },
	{ name: "conversation-start-hour", limit: 120, windowSeconds: 3600 },
];

export async function POST(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	if (
		await hitRateLimit(
			getCounterStore(),
			`conversation-start:${ctx.user.id}`,
			START_LIMITS,
		)
	) {
		return errorResponse(ERROR_CODES.rateLimited, 429);
	}
	try {
		return Response.json(
			"listingId" in body.data
				? await startConversation(ctx.payload, ctx.user, body.data.listingId)
				: await startShopConversation(ctx.payload, ctx.user, body.data.shopId),
		);
	} catch (error) {
		return handleServiceError("inbox:start", error);
	}
}
