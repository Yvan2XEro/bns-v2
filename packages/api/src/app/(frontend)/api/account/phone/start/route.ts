import config from "@payload-config";
import { getPayload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	PhoneVerificationError,
	startPhoneVerification,
} from "@/services/phoneVerification";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { phone?: string };
		if (!body.phone) {
			return Response.json(
				{ message: "Phone number is required" },
				{ status: 400 },
			);
		}

		const payload = await getPayload({ config });
		const { user } = await payload.auth({ headers: request.headers });

		if (!user) {
			return errorResponse(ERROR_CODES.unauthorized, 401);
		}

		const userDoc = await payload.findByID({
			collection: "users",
			id: user.id,
			overrideAccess: true,
		});

		const status = await startPhoneVerification(
			payload,
			userDoc as never,
			body.phone,
		);

		return Response.json({
			message: "Verification code sent",
			...status,
		});
	} catch (error) {
		// Only our own business failures are described to the user. Anything else
		// is logged and reported as a generic server error, so a driver or Mongo
		// message can never reach a client.
		if (error instanceof PhoneVerificationError) {
			return errorResponse(error.code, error.status);
		}
		console.error("[phone/start]", error);
		return errorResponse(ERROR_CODES.server, 500);
	}
}
