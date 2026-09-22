import config from "@payload-config";
import { getPayload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	ContactRevealError,
	revealContactPhone,
} from "@/services/contactReveal";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const payload = await getPayload({ config });
	const { user } = await payload.auth({ headers: request.headers });
	if (!user) return errorResponse(ERROR_CODES.unauthorized, 401);

	const { id } = await params;
	try {
		const result = await revealContactPhone(payload, {
			listingId: id,
			viewerId: String(user.id),
		});
		return Response.json(result, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		if (error instanceof ContactRevealError) {
			return errorResponse(error.code, error.status);
		}
		console.error("[contact-phone]", error);
		return errorResponse(ERROR_CODES.server, 500);
	}
}
