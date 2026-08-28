import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	readJson,
	requireModerator,
} from "@/lib/moderationRoute";
import { approveListing, rejectListing } from "@/services/moderation";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { id } = await params;
	const body = await readJson(request);
	const action = body.action;
	const note = typeof body.note === "string" ? body.note : null;

	try {
		if (action === "approve") {
			return Response.json(
				await approveListing(ctx.payload, ctx.actor, id, note),
			);
		}

		if (action === "reject") {
			const reason = typeof body.reason === "string" ? body.reason : "";
			return Response.json(
				await rejectListing(ctx.payload, ctx.actor, id, reason, note),
			);
		}

		return errorResponse(ERROR_CODES.badRequest, 400);
	} catch (error) {
		return handleModerationError("listings", error);
	}
}
