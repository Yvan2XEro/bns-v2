import type { Payload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	readJson,
	requireModerator,
} from "@/lib/moderationRoute";
import { cancelOrder, findOrderForModeration } from "@/services/moderation";
import { buildStaffOrderView } from "@/services/orders/queries";

/**
 * A moderator arbitrates with the order's own serialised view (Task 12) —
 * never a hand-built projection. `risk` now carries both fields a moderator
 * needs to triage a dispute (the tier and the at-placement refusal count)
 * straight from that projection, so this route no longer rebuilds it.
 * Neither field requires (or allows) reading `buyer-phone-scores`, so the
 * buyer's phone hash and the raw refusal rows behind that count are never
 * within reach of this route.
 */
async function loadStaffOrderSheet(payload: Payload, id: string) {
	const order = await findOrderForModeration(payload, id);
	return buildStaffOrderView(payload, order);
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { id } = await params;

	try {
		return Response.json(await loadStaffOrderSheet(ctx.payload, id));
	} catch (error) {
		return handleModerationError("orders", error);
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { id } = await params;
	const body = await readJson(request);

	try {
		if (body.action === "cancel") {
			const reason = typeof body.reason === "string" ? body.reason : "";
			const note = typeof body.note === "string" ? body.note : null;
			return Response.json(
				await cancelOrder(ctx.payload, ctx.actor, id, { reason, note }),
			);
		}

		return errorResponse(ERROR_CODES.badRequest, 400);
	} catch (error) {
		return handleModerationError("orders", error);
	}
}
