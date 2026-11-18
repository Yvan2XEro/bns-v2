import config from "@payload-config";
import { getPayload } from "payload";
import { clientIp } from "@/lib/clientIp";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { getCounterStore, hitRateLimit } from "@/lib/rateLimit";
import { handleServiceError } from "@/lib/shopRoute";
import { checkHandleAvailability } from "@/services/shops";

const HANDLE_CHECK_LIMITS = [{ name: "minute", limit: 30, windowSeconds: 60 }];

export async function GET(request: Request) {
	try {
		if (
			await hitRateLimit(
				getCounterStore(),
				`handle-available:${clientIp(request)}`,
				HANDLE_CHECK_LIMITS,
			)
		) {
			return errorResponse(ERROR_CODES.rateLimited, 429);
		}
		const handle = new URL(request.url).searchParams.get("handle") ?? "";
		const payload = await getPayload({ config });
		return Response.json(await checkHandleAvailability(payload, handle));
	} catch (error) {
		// A Redis outage lands here and the check fails closed: same shared
		// error contract as a service failure, not a raw crash.
		return handleServiceError("handle-available", error);
	}
}
