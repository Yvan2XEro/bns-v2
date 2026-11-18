import {
	handleModerationError,
	readJson,
	requireModerator,
} from "@/lib/moderationRoute";
import { removeReviewPhoto } from "@/services/reviewModeration";

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ id: string; mediaId: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { id, mediaId } = await params;
	const body = await readJson(request);
	const note = typeof body.note === "string" ? body.note : null;

	try {
		return Response.json(
			await removeReviewPhoto(ctx.payload, ctx.actor, id, mediaId, note),
		);
	} catch (error) {
		return handleModerationError("reviews", error);
	}
}
