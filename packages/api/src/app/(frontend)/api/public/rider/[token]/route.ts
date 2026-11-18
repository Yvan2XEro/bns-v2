import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/shopRoute";
import {
	publicRiderContext,
	riderLinkView,
} from "@/services/delivery/riderLinks";

const paramsSchema = z.object({ token: z.string().min(1).max(128) });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success)
		return errorResponse(ERROR_CODES.shipmentRiderLinkInvalid, 404);
	try {
		const { payload, shipment } = await publicRiderContext(
			request,
			parsed.data.token,
		);
		return Response.json(await riderLinkView(payload, shipment));
	} catch (error) {
		return handleServiceError("public-rider:view", error);
	}
}
