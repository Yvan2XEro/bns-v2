import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { getDeliveryEstimateCache } from "@/lib/delivery/estimateCache";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/shopRoute";
import { publicDeliveryEstimates } from "@/services/delivery/publicEstimates";

const schema = z.object({
	id: z.string().trim().min(1),
	city: z.string().trim().min(1).max(100).optional(),
	district: z.string().trim().min(1).max(100).optional(),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const query = new URL(request.url).searchParams;
	const parsed = schema.safeParse({
		...(await params),
		city: query.get("city") ?? undefined,
		district: query.get("district") ?? undefined,
	});
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const payload = await getPayload({ config });
		const { user } = await payload.auth({ headers: request.headers });
		return Response.json(
			await publicDeliveryEstimates(
				payload,
				parsed.data.id,
				parsed.data,
				user?.homeLocation,
				getDeliveryEstimateCache(),
			),
		);
	} catch (error) {
		return handleServiceError("publicDeliveryEstimates", error);
	}
}
