import { z } from "zod";
import { MODERATION_QUEUE_TYPES } from "@/contracts/moderationConsole";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import {
	getModerationQueue,
	isQueueCursorValid,
} from "@/services/moderationQueue";

const querySchema = z.object({
	type: z.enum(MODERATION_QUEUE_TYPES).optional(),
	mine: z.enum(["1", "true"]).optional(),
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const url = new URL(request.url);
	const query = querySchema.safeParse({
		type: url.searchParams.get("type") ?? undefined,
		mine: url.searchParams.get("mine") ?? undefined,
		cursor: url.searchParams.get("cursor") ?? undefined,
		limit: url.searchParams.get("limit") ?? undefined,
	});
	if (!query.success || !isQueueCursorValid(query.data.cursor)) {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	try {
		return Response.json(
			await getModerationQueue(ctx.payload, ctx.actor, {
				type: query.data.type,
				mine: query.data.mine !== undefined,
				cursor: query.data.cursor,
				limit: query.data.limit,
			}),
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch (error) {
		return handleModerationError("queue:list", error);
	}
}
