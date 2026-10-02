import type { Payload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	readJson,
	requireModerator,
} from "@/lib/moderationRoute";
import type { OrderEvent, OrderItem } from "@/payload-types";
import { cancelOrder, findOrderForModeration } from "@/services/moderation";
import { serializeOrderForStaff } from "@/services/orders/serialize";

/**
 * A moderator arbitrates with the order's own serialised view (Task 12) —
 * never a hand-built projection — plus the two risk fields a moderator
 * needs to triage a dispute: the tier and the at-placement refusal count
 * already stored on the order itself. Neither of those requires (or
 * allows) reading `buyer-phone-scores`, so the buyer's phone hash and the
 * raw refusal rows behind that count are never within reach of this route.
 */
async function loadStaffOrderSheet(payload: Payload, id: string) {
	const order = await findOrderForModeration(payload, id);

	const [items, events] = await Promise.all([
		payload.find({
			collection: "order-items",
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			where: { order: { equals: id } },
		}),
		payload.find({
			collection: "order-events",
			depth: 0,
			limit: 0,
			pagination: false,
			sort: "createdAt",
			overrideAccess: true,
			where: { order: { equals: id } },
		}),
	]);

	const view = serializeOrderForStaff(
		order,
		items.docs as OrderItem[],
		events.docs as OrderEvent[],
	);

	return {
		...view,
		risk: {
			phoneTier: order.risk?.phoneTier ?? null,
			refusalsAtPlacement: order.risk?.refusalsAtPlacement ?? null,
		},
	};
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
