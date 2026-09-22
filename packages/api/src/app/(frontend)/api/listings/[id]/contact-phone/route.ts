import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	ContactRevealError,
	revealContactPhone,
} from "@/services/contactReveal";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const parsed = paramsSchema.safeParse(await params);
		if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

		const payload = await getPayload({ config });
		const { user } = await payload.auth({ headers: request.headers });
		if (!user) return errorResponse(ERROR_CODES.unauthorized, 401);

		const result = await revealContactPhone(payload, {
			listingId: parsed.data.id,
			viewerId: String(user.id),
		});
		return Response.json(result, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		if (error instanceof ContactRevealError) {
			return errorResponse(error.code, error.status);
		}
		// A Redis outage lands here and the reveal fails closed: handing out a
		// phone number while the rate limit is down would reopen the scraping
		// this route exists to close.
		console.error("[contact-phone]", error);
		return errorResponse(ERROR_CODES.server, 500);
	}
}
