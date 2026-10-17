import { z } from "zod";
import { MODERATION_ACTIONS } from "@/collections/ModerationLog";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import type { ModerationLog } from "@/payload-types";
import {
	isPageCursorValid,
	moderationLogCsv,
	readModerationLog,
} from "@/services/moderationConsole";

const TARGET_TYPES = [
	"listing",
	"user",
	"report",
	"shop",
	"verification-request",
	"order",
	"commission-invoice",
	"dispute",
	"resale-link",
	"risk-flag",
	"review",
] as const satisfies readonly ModerationLog["targetType"][];

const isoDate = z
	.string()
	.refine((value) => !Number.isNaN(Date.parse(value)))
	.transform((value) => new Date(value).toISOString());

const querySchema = z.object({
	actor: z
		.string()
		.regex(/^[0-9a-f]{24}$/i)
		.optional(),
	targetType: z.enum(TARGET_TYPES).optional(),
	targetId: z.string().trim().min(1).max(100).optional(),
	action: z.enum(MODERATION_ACTIONS).optional(),
	from: isoDate.optional(),
	to: isoDate.optional(),
	cursor: z.string().optional(),
	format: z.enum(["json", "csv"]).default("json"),
});

export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const url = new URL(request.url);
	const query = querySchema.safeParse(
		Object.fromEntries(
			[...url.searchParams].filter(([, value]) => value !== ""),
		),
	);
	if (!query.success || !isPageCursorValid(query.data.cursor)) {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	const { format, ...filters } = query.data;
	try {
		if (format === "csv") {
			return new Response(await moderationLogCsv(ctx.payload, filters), {
				headers: {
					"Content-Type": "text/csv; charset=utf-8",
					"Content-Disposition": 'attachment; filename="moderation-log.csv"',
					"Cache-Control": "private, no-store",
				},
			});
		}
		return Response.json(await readModerationLog(ctx.payload, filters), {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		return handleModerationError("log:list", error);
	}
}
