import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import {
	requireResellerPayoutApproval,
	retryResellerPayout,
	submitResellerPayout,
} from "@/services/resellerPayouts";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({ action: z.enum(["approve", "retry"]) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	let body: z.infer<typeof bodySchema>;
	try {
		body = bodySchema.parse(await request.json());
	} catch {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	try {
		if (body.action === "retry") {
			const result = await retryResellerPayout(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
			);
			return Response.json(result, { status: result.submitted ? 202 : 200 });
		}
		const payout = await requireResellerPayoutApproval(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
		);
		const submitted = await submitResellerPayout(ctx.payload, payout.reference);
		return Response.json(
			{ payout, submitted },
			{ status: submitted ? 202 : 200 },
		);
	} catch (error) {
		return handleServiceError("resellerPayout:moderate", error);
	}
}
