import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { isLaunchCityKey } from "@/lib/launchCities";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { testShopDelivery } from "@/services/delivery/zones";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	city: z.string().refine(isLaunchCityKey),
	district: z.string().optional(),
	subtotal: z.number().int().min(0),
});
type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.validation, 400);
	try {
		return Response.json(
			await testShopDelivery(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
				body.data,
			),
		);
	} catch (error) {
		return handleServiceError("deliveryZones:test", error);
	}
}
