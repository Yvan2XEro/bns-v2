import { z } from "zod";
import { MODERATION_SHOP_STATUSES } from "@/contracts/moderationConsole";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import {
	isPageCursorValid,
	searchModerationShops,
} from "@/services/moderationConsole";

const querySchema = z.object({
	q: z.string().trim().max(100).optional(),
	status: z.enum(MODERATION_SHOP_STATUSES).optional(),
	cursor: z.string().optional(),
});

export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const url = new URL(request.url);
	const query = querySchema.safeParse({
		q: url.searchParams.get("q") ?? undefined,
		status: url.searchParams.get("status") ?? undefined,
		cursor: url.searchParams.get("cursor") ?? undefined,
	});
	if (!query.success || !isPageCursorValid(query.data.cursor)) {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	try {
		return Response.json(await searchModerationShops(ctx.payload, query.data), {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		return handleModerationError("shops:search", error);
	}
}
