import { z } from "zod";
import { clientIp } from "@/lib/clientIp";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { placeOrder } from "@/services/checkout";

// Shape only, same discipline as `/api/checkout/quote`: every business rule
// (the address, the quote hash, the terms version) is `placeOrder`'s own.
const bodySchema = z.object({
	address: z.record(z.unknown()),
	deliveryOptionId: z.unknown(),
	paymentMethod: z.unknown(),
	locale: z.unknown().optional(),
	quoteHash: z.unknown(),
	termsAccepted: z.unknown(),
	idempotencyKey: z.unknown(),
});

export async function POST(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const placed = await placeOrder(ctx.payload, ctx.user, body.data, {
			ip: clientIp(request),
		});
		return Response.json(placed);
	} catch (error) {
		return handleServiceError("checkout:place", error);
	}
}
