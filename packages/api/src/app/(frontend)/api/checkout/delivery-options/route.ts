import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listDeliveryOptions } from "@/services/checkout";

/**
 * The checkout delivery step's options for a city. A `GET` because it reads
 * the buyer's own cart and the shop's settings and writes nothing; the city
 * and district come from the query string, and an unserved city simply
 * answers no option — `checkout.cityNotServed` is the quote's refusal, not
 * this list's.
 */
export async function GET(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const query = new URL(request.url).searchParams;
	try {
		return Response.json(
			await listDeliveryOptions(ctx.payload, ctx.user, {
				city: query.get("city") ?? undefined,
				district: query.get("district") ?? undefined,
				...(query.has("paymentMethod")
					? { paymentMethod: query.get("paymentMethod") }
					: {}),
			}),
		);
	} catch (error) {
		return handleServiceError("checkout:deliveryOptions", error);
	}
}
