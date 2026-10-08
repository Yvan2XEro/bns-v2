import { z } from "zod";
import { deliveryCoordinatesSchema } from "@/lib/delivery/schemas";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import {
	publicRiderContext,
	resolveRiderLink,
	riderLinkPickedUp,
} from "@/services/delivery/riderLinks";

const paramsSchema = z.object({ token: z.string().min(1).max(128) });
const bodySchema = z
	.object({ gps: deliveryCoordinatesSchema.optional() })
	.strict();

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success)
		return errorResponse(ERROR_CODES.shipmentRiderLinkInvalid, 404);
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const { payload } = await publicRiderContext(request, parsed.data.token);
		const shipment = await withTransaction(payload, async (req) => {
			const current = await resolveRiderLink(
				req.payload,
				parsed.data.token,
				req,
			);
			return riderLinkPickedUp(req, current, body.data.gps);
		});
		return Response.json({ id: String(shipment.id), status: shipment.status });
	} catch (error) {
		return handleServiceError("public-rider:picked-up", error);
	}
}
