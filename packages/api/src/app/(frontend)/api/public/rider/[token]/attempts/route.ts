import { z } from "zod";
import { reportAttemptSchema } from "@/lib/delivery/schemas";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import {
	publicRiderContext,
	resolveRiderLink,
	riderLinkAttempt,
} from "@/services/delivery/riderLinks";

const paramsSchema = z.object({ token: z.string().min(1).max(128) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success)
		return errorResponse(ERROR_CODES.shipmentRiderLinkInvalid, 404);
	const body = reportAttemptSchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const { payload } = await publicRiderContext(request, parsed.data.token);
		const shipment = await withTransaction(payload, async (req) => {
			const current = await resolveRiderLink(
				req.payload,
				parsed.data.token,
				req,
			);
			return riderLinkAttempt(req, current, body.data);
		});
		return Response.json({
			id: String(shipment.id),
			status: shipment.status,
			attempts: shipment.attempts ?? [],
			redelivery: shipment.redelivery ?? null,
			finalFailure: shipment.finalFailure ?? null,
		});
	} catch (error) {
		return handleServiceError("public-rider:attempt", error);
	}
}
