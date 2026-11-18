import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { respondToDispute } from "@/services/disputeActions";

const bodySchema = z.object({
	action: z.enum(["accept", "propose", "contest"]),
	amount: z.number().int().positive().optional(),
	returnRequired: z.boolean().optional(),
	message: z.string().trim().max(2000).optional(),
	evidenceIds: z.array(z.string().trim().min(1)).max(5).optional(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	if (!id.trim()) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const dispute = await respondToDispute(
			ctx.payload,
			ctx.user,
			id,
			parsed.data,
		);
		return Response.json({ id: String(dispute.id), status: dispute.status });
	} catch (error) {
		return handleServiceError("disputes:respond", error);
	}
}
