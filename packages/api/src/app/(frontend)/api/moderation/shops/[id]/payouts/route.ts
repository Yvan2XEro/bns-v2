import { z } from "zod";
import { PAYOUT_HOLD_REASONS } from "@/collections/PayoutHolds";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	readJson,
	requireModerator,
} from "@/lib/moderationRoute";
import {
	approvePayoutAccount,
	holdPayouts,
	rejectPayoutAccount,
	releasePayoutHold,
} from "@/services/moderation";

type Params = { params: Promise<{ id: string }> };

const note = z.string().max(1000).nullish();

const bodySchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("hold"),
		scope: z.enum(["shop", "order"]),
		orderId: z.string().trim().min(1).nullish(),
		reason: z.enum(PAYOUT_HOLD_REASONS),
		untilDays: z.number().int().min(1).max(365).nullish(),
		blocksCharges: z.boolean().optional(),
		note,
	}),
	z.object({
		action: z.literal("release"),
		holdId: z.string().trim().min(1),
		note,
	}),
	z.object({
		action: z.enum(["approve_account", "reject_account"]),
		accountId: z.string().trim().min(1),
		note,
	}),
]);

/** Staff's hands on a shop's money: holds, releases and payout-account review. */
export async function POST(request: Request, { params }: Params) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;

	const parsed = bodySchema.safeParse(await readJson(request));
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const body = parsed.data;

	try {
		switch (body.action) {
			case "hold":
				if (body.scope === "order" && !body.orderId) {
					return errorResponse(ERROR_CODES.badRequest, 400);
				}
				return Response.json(
					await holdPayouts(ctx.payload, ctx.actor, id, body),
					{ status: 201 },
				);
			case "release":
				return Response.json(
					await releasePayoutHold(ctx.payload, ctx.actor, body.holdId, {
						note: body.note,
						shopId: id,
					}),
				);
			case "approve_account":
				return Response.json(
					await approvePayoutAccount(
						ctx.payload,
						ctx.actor,
						id,
						body.accountId,
						{
							note: body.note,
						},
					),
				);
			case "reject_account":
				return Response.json(
					await rejectPayoutAccount(
						ctx.payload,
						ctx.actor,
						id,
						body.accountId,
						{
							note: body.note,
						},
					),
				);
		}
	} catch (error) {
		return handleModerationError("shops:payouts", error);
	}
}
