import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	readJson,
	requireModerator,
} from "@/lib/moderationRoute";
import { decideRiskFlag } from "@/services/moderation";
import { getRiskFlagDetail } from "@/services/riskFlagDetail";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const decisionSchema = z
	.object({
		outcome: z.enum(["reviewed", "dismissed", "actioned"]),
		resolution: z
			.enum([
				"none",
				"warned",
				"limited",
				"user_suspended",
				"shop_suspended",
				"payouts_held",
				"resale_link_suspended",
				"order_cancelled",
				"false_positive",
			])
			.optional(),
		note: z.string().trim().max(2000).nullable().optional(),
		action: z
			.discriminatedUnion("type", [
				z.object({
					type: z.literal("suspend_user"),
					targetId: z.string().trim().min(1),
					reason: z.string().trim().min(1),
					durationDays: z.number().int().positive().nullable(),
				}),
				z.object({
					type: z.literal("suspend_shop"),
					targetId: z.string().trim().min(1),
					reason: z.string().trim().min(1),
					durationDays: z.number().int().positive().nullable(),
				}),
				z.object({
					type: z.literal("hold_payouts"),
					targetId: z.string().trim().min(1),
					reason: z.enum([
						"payout_account_changed",
						"fraud_signal",
						"reconciliation_mismatch",
						"dispute_open",
						"return_open",
						"moderation",
						"payout_failed_repeatedly",
					]),
					durationDays: z.number().int().positive().nullable(),
				}),
				z.object({
					type: z.literal("release_holds"),
					targetId: z.string().trim().min(1),
					reason: z.string().trim().min(1),
					durationDays: z.number().int().positive().nullable(),
				}),
				z.object({
					type: z.literal("suspend_resale_link"),
					targetId: z.string().trim().min(1),
					reason: z.enum([
						"quality",
						"pricing",
						"fraud_review",
						"terms",
						"other",
					]),
					durationDays: z.number().int().positive().nullable(),
				}),
				z.object({
					type: z.literal("cancel_order"),
					targetId: z.string().trim().min(1),
					reason: z.enum(["staff_fraud", "staff_policy", "staff_other"]),
					durationDays: z.number().int().positive().nullable(),
				}),
			])
			.optional(),
	})
	.superRefine((value, context) => {
		if (value.outcome !== "actioned" && value.action) {
			context.addIssue({
				code: "custom",
				message: "Actions require the actioned outcome.",
			});
		}
		if (value.outcome === "actioned") {
			if (
				!value.action ||
				!value.note?.trim() ||
				!value.resolution ||
				value.resolution === "none"
			) {
				context.addIssue({
					code: "custom",
					message: "An action, resolution, and note are required.",
				});
			}
			const expectedResolution =
				value.action?.type === "suspend_user"
					? "user_suspended"
					: value.action?.type === "suspend_shop"
						? "shop_suspended"
						: value.action?.type === "hold_payouts"
							? "payouts_held"
							: value.action?.type === "release_holds"
								? "false_positive"
								: value.action?.type === "suspend_resale_link"
									? "resale_link_suspended"
									: value.action?.type === "cancel_order"
										? "order_cancelled"
										: undefined;
			if (expectedResolution && value.resolution !== expectedResolution) {
				context.addIssue({
					code: "custom",
					message: "Action and resolution do not match.",
				});
			}
		}
	});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
	const ctx = await requireModerator(_request);
	if (ctx instanceof Response) return ctx;
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await getRiskFlagDetail(ctx.payload, ctx.actor, parsedParams.data.id),
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch (error) {
		return handleModerationError("risk-flags:detail", error);
	}
}

export async function POST(request: Request, { params }: Params) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const body = decisionSchema.safeParse(await readJson(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await decideRiskFlag(
				ctx.payload,
				ctx.actor,
				parsedParams.data.id,
				body.data,
			),
		);
	} catch (error) {
		return handleModerationError("risk-flags:decision", error);
	}
}
