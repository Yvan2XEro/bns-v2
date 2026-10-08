import { z } from "zod";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import { listModerationDisputes } from "@/services/disputeModeration";

const querySchema = z.object({
	status: z
		.enum(["open", "awaiting_seller", "awaiting_buyer", "under_review"])
		.optional(),
	reason: z
		.enum([
			"not_received",
			"not_as_described",
			"damaged",
			"counterfeit",
			"wrong_item",
			"seller_no_show",
			"cod_refused_abuse",
		])
		.optional(),
	paymentMethod: z.enum(["cod", "mobile_money"]).optional(),
	overdue: z.enum(["true", "false"]).optional(),
	assigned: z.enum(["me"]).optional(),
});

export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const url = new URL(request.url);
	const query = querySchema.safeParse({
		status: url.searchParams.get("status") ?? undefined,
		reason: url.searchParams.get("reason") ?? undefined,
		paymentMethod: url.searchParams.get("paymentMethod") ?? undefined,
		overdue: url.searchParams.get("overdue") ?? undefined,
		assigned: url.searchParams.get("assigned") ?? undefined,
	});
	if (!query.success)
		return Response.json({ error: "bad_request" }, { status: 400 });
	try {
		return Response.json(
			await listModerationDisputes(ctx.payload, {
				status: query.data.status,
				reason: query.data.reason,
				paymentMethod: query.data.paymentMethod,
				assignedTo: query.data.assigned === "me" ? ctx.actor.id : undefined,
				overdue:
					query.data.overdue === undefined
						? undefined
						: query.data.overdue === "true",
			}),
		);
	} catch (error) {
		return handleModerationError("disputes:list", error);
	}
}
