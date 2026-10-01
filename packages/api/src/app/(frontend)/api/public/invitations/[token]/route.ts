import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { clientIp } from "@/lib/clientIp";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	getCounterStore,
	hitRateLimit,
	type RateLimitWindow,
} from "@/lib/rateLimit";
import { handleServiceError } from "@/lib/shopRoute";
import { lookupInvitation } from "@/services/shopMembers";

/** An unauthenticated endpoint keyed on a 32-byte secret: the limit is against enumeration, not load. */
export const INVITATION_LOOKUP_LIMITS: readonly RateLimitWindow[] = [
	{ name: "invitation-lookup:hour", limit: 30, windowSeconds: 3600 },
];

// A base64url encoding of 32 bytes is 43 characters; the ceiling stops a
// megabyte of "token" reaching the hasher.
const paramsSchema = z.object({ token: z.string().trim().min(1).max(128) });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		// Counted before the lookup: a failed call is an enumeration attempt too.
		if (
			await hitRateLimit(
				getCounterStore(),
				`invitation-lookup:${clientIp(request)}`,
				INVITATION_LOOKUP_LIMITS,
			)
		) {
			return errorResponse(ERROR_CODES.rateLimited, 429);
		}
		const payload = await getPayload({ config });
		return Response.json(await lookupInvitation(payload, parsed.data.token));
	} catch (error) {
		return handleServiceError("invitation:lookup", error);
	}
}
