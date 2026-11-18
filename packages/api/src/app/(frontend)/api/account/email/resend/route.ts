import config from "@payload-config";
import { getPayload } from "payload";
import { clientIp } from "@/lib/clientIp";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	getCounterStore,
	hitRateLimit,
	type RateLimitWindow,
} from "@/lib/rateLimit";
import { resendVerificationEmail } from "@/services/emailVerification";

/** Per address the minute between sends already holds; this caps one sender. */
const RESEND_LIMITS: readonly RateLimitWindow[] = [
	{ name: "email-verify-resend:hour", limit: 10, windowSeconds: 3600 },
];

/**
 * `POST { email }` — sends the verification email again. Answers 202 whether
 * or not the address has an account, is verified, or is waiting out its
 * minute, so it never tells who is registered.
 */
export async function POST(request: Request) {
	if (await hitRateLimit(getCounterStore(), clientIp(request), RESEND_LIMITS)) {
		return errorResponse(ERROR_CODES.rateLimited, 429);
	}
	let email: unknown;
	try {
		email = ((await request.json()) as { email?: unknown }).email;
	} catch {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	const payload = await getPayload({ config });
	try {
		await resendVerificationEmail(payload, email);
	} catch (error) {
		// A failed send must not tell the address apart either.
		payload.logger.error({
			err: error,
			msg: "[auth] verification resend failed",
		});
	}
	return new Response(null, { status: 202 });
}
