import { z } from "zod";
import { DISPUTE_OUTCOMES, DISPUTE_REASONS } from "@/collections/Disputes";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { openDispute } from "@/services/disputes";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	reason: z.enum(DISPUTE_REASONS),
	subject: z.enum(["goods", "refund"]).optional(),
	description: z.string().trim().min(20).max(2000),
	requestedOutcome: z.enum(DISPUTE_OUTCOMES),
	requestedAmount: z.number().int().nonnegative().optional(),
	items: z
		.array(
			z.object({
				orderItemId: z.string().trim().min(1),
				quantity: z.number().int().positive(),
			}),
		)
		.min(1),
	returnCaseId: z.string().trim().min(1).optional(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const input = bodySchema.safeParse(await request.json().catch(() => null));
	if (!input.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const dispute = await openDispute(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			input.data,
		);
		return Response.json(
			{
				id: String(dispute.id),
				number: dispute.number,
				status: dispute.status,
			},
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("dispute:open", error);
	}
}
