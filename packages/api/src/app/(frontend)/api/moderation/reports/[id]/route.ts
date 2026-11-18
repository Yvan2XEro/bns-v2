import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	readJson,
	requireModerator,
} from "@/lib/moderationRoute";
import { decideReport } from "@/services/moderation";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { id } = await params;
	const body = await readJson(request);
	const outcome = body.outcome;

	if (outcome !== "resolved" && outcome !== "dismissed") {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}

	try {
		return Response.json(
			await decideReport(ctx.payload, ctx.actor, id, {
				outcome,
				resolution:
					typeof body.resolution === "string" ? body.resolution : null,
			}),
		);
	} catch (error) {
		return handleModerationError("reports", error);
	}
}
