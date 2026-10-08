import { z } from "zod";
import {
	DISPUTE_LIABLE_PARTIES,
	DISPUTE_REASON_CODES,
} from "@/collections/Disputes";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import {
	assignDispute,
	getModerationDisputeSheet,
	previewDisputeOutcome,
	redactDisputeMessage,
	requestDisputeInfo,
	resolveDispute,
	revokeDisputeStrike,
} from "@/services/disputeModeration";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("request_info"),
		from: z.enum(["buyer", "seller"]),
		message: z.string().trim().min(1).max(2000),
	}),
	z.object({ action: z.literal("assign") }),
	z.object({
		action: z.literal("redact_message"),
		messageId: z.string().trim().min(1),
		note: z.string().trim().min(10).max(2000),
	}),
	z.object({
		action: z.literal("revoke_strike"),
		strikeId: z.string().trim().min(1),
		note: z.string().trim().min(10).max(2000),
	}),
	z.object({
		action: z.literal("preview"),
		refundAmount: z.number().int().nonnegative(),
	}),
	z.object({
		action: z.literal("resolve"),
		outcome: z.enum(["resolved_buyer", "resolved_seller", "resolved_split"]),
		refundAmount: z.number().int().nonnegative(),
		returnRequired: z.boolean(),
		returnShippingPaidBy: z.enum(["seller", "buyer"]).nullable(),
		liableParty: z.enum(DISPUTE_LIABLE_PARTIES),
		reasonCode: z.enum(DISPUTE_REASON_CODES),
		publicStatement: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
		reviewAction: z.enum(["published", "removed"]).optional(),
		note: z.string().trim().min(1).max(2000),
	}),
]);

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await getModerationDisputeSheet(ctx.payload, ctx.actor, parsed.data.id),
		);
	} catch (error) {
		return handleModerationError("disputes:detail", error);
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		if (body.data.action === "preview") {
			return Response.json(
				await previewDisputeOutcome(
					ctx.payload,
					parsedParams.data.id,
					body.data.refundAmount,
				),
			);
		}
		if (body.data.action === "assign") {
			const dispute = await assignDispute(
				ctx.payload,
				ctx.actor,
				parsedParams.data.id,
			);
			return Response.json({
				id: String(dispute.id),
				assignedTo: ctx.actor.id,
			});
		}
		if (body.data.action === "redact_message") {
			await redactDisputeMessage(
				ctx.payload,
				ctx.actor,
				parsedParams.data.id,
				body.data.messageId,
				body.data.note,
			);
			return Response.json({ redacted: true });
		}
		if (body.data.action === "revoke_strike") {
			await revokeDisputeStrike(
				ctx.payload,
				ctx.actor,
				body.data.strikeId,
				body.data.note,
			);
			return Response.json({ revoked: true });
		}
		const dispute =
			body.data.action === "request_info"
				? await requestDisputeInfo(
						ctx.payload,
						ctx.actor,
						parsedParams.data.id,
						{ from: body.data.from, message: body.data.message },
					)
				: await resolveDispute(
						ctx.payload,
						ctx.actor,
						parsedParams.data.id,
						body.data,
					);
		return Response.json({ id: String(dispute.id), status: dispute.status });
	} catch (error) {
		return handleModerationError("disputes:action", error);
	}
}
