import { z } from "zod";
import { clientIp } from "@/lib/clientIp";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { quoteCheckout } from "@/services/checkout";

// Shape only: every business rule on the address (length, phone format, the
// launch city, the district, the landmark) is `quoteCheckout`'s own —
// `checkout.addressInvalid` names the field, which a loose zod bound here
// cannot.
const bodySchema = z.object({
	address: z.record(z.unknown()),
	deliveryOptionId: z.unknown(),
	paymentMethod: z.unknown(),
	locale: z.unknown().optional(),
});

export async function POST(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const quote = await quoteCheckout(ctx.payload, ctx.user, body.data, {
			ip: clientIp(request),
		});
		return Response.json(quote);
	} catch (error) {
		return handleServiceError("checkout:quote", error);
	}
}
