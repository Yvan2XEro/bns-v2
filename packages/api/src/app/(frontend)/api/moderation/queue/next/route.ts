import { z } from "zod";
import { ASSIGNABLE_QUEUE_TYPES } from "@/contracts/moderationConsole";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	readJson,
	requireModerator,
} from "@/lib/moderationRoute";
import { takeNextQueueItem } from "@/services/moderationQueue";

const bodySchema = z.object({
	type: z.enum(ASSIGNABLE_QUEUE_TYPES).optional(),
});

/** Assigns the caller the most urgent unassigned item; `{ item: null }` when nothing is left. */
export async function POST(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await readJson(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			{ item: await takeNextQueueItem(ctx.payload, ctx.actor, body.data.type) },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch (error) {
		return handleModerationError("queue:next", error);
	}
}
