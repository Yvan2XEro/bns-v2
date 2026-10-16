import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { revealRiderPhone } from "@/services/delivery/riderPhone";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/** A Redis outage fails closed like the listing phone reveal: no rate limit, no number. */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		const result = await revealRiderPhone(ctx.payload, {
			shipmentId: parsed.data.id,
			viewerId: ctx.user.id,
		});
		return Response.json(result, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return handleServiceError("shipments:rider-phone", error);
	}
}
