import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { getCounterStore, hitRateLimit } from "@/lib/rateLimit";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getShopInsights } from "@/services/shopInsights";

const querySchema = z.object({
	period: z.enum(["7d", "30d", "90d"]).default("7d"),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const url = new URL(request.url);
	const parsed = querySchema.safeParse({
		period: url.searchParams.get("period") ?? undefined,
	});
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const required = await requireUser(request);
	if (required instanceof Response) return required;
	if (
		await hitRateLimit(getCounterStore(), `shop-insights:${required.user.id}`, [
			{ name: "shop-insights", limit: 60, windowSeconds: 3600 },
		])
	) {
		return errorResponse(ERROR_CODES.rateLimited, 429);
	}
	const { id } = await params;
	try {
		const insights = await getShopInsights(
			required.payload,
			required.user,
			id,
			parsed.data.period,
		);
		return Response.json(insights, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		return handleServiceError("shop:insights", error);
	}
}
