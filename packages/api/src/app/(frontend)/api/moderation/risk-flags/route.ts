import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import {
	getRiskFlagQueue,
	isRiskFlagCursorValid,
} from "@/services/riskFlagQueue";
import {
	RISK_SEVERITIES,
	RISK_SIGNALS,
	RISK_STATUSES,
	RISK_SUBJECT_TYPES,
} from "@/types/riskModeration";

const querySchema = z.object({
	status: z.enum(RISK_STATUSES).optional(),
	severity: z.enum(RISK_SEVERITIES).optional(),
	signal: z.enum(RISK_SIGNALS).optional(),
	subjectType: z.enum(RISK_SUBJECT_TYPES).optional(),
	cursor: z.string().optional(),
});

export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const url = new URL(request.url);
	const query = querySchema.safeParse({
		status: url.searchParams.get("status") ?? undefined,
		severity: url.searchParams.get("severity") ?? undefined,
		signal: url.searchParams.get("signal") ?? undefined,
		subjectType: url.searchParams.get("subjectType") ?? undefined,
		cursor: url.searchParams.get("cursor") ?? undefined,
	});
	if (!query.success || !isRiskFlagCursorValid(query.data?.cursor)) {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	try {
		return Response.json(await getRiskFlagQueue(ctx.payload, query.data), {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		return handleModerationError("risk-flags:list", error);
	}
}
