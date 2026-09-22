import config from "@payload-config";
import { getPayload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	BoostPurchaseError,
	startBoostPurchase,
} from "@/services/boostPurchase";

export async function POST(request: Request) {
	const payload = await getPayload({ config });
	const { user } = await payload.auth({ headers: request.headers });
	if (!user) return errorResponse(ERROR_CODES.unauthorized, 401);

	const body = (await request.json().catch(() => ({}))) as Record<
		string,
		unknown
	>;

	try {
		const result = await startBoostPurchase(payload, {
			userId: String(user.id),
			email: user.email,
			listingId: body.listingId,
			duration: body.duration,
			providerName: body.provider,
			returnUrl:
				typeof body.returnUrl === "string" ? body.returnUrl : undefined,
			idempotencyKey: request.headers.get("idempotency-key"),
			serverUrl: process.env.PAYLOAD_PUBLIC_SERVER_URL ?? "",
		});
		return Response.json(result);
	} catch (error) {
		if (error instanceof BoostPurchaseError) {
			return errorResponse(error.code, error.status);
		}
		console.error("[boost] purchase failed", error);
		return errorResponse(ERROR_CODES.server, 500);
	}
}
