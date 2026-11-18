import config from "@payload-config";
import { getPayload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	PhoneVerificationError,
	verifyPhoneVerificationCode,
} from "@/services/phoneVerification";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { code?: string };
		if (!body.code) {
			return Response.json(
				{ message: "Verification code is required" },
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

		const status = await verifyPhoneVerificationCode(
			payload,
			userDoc as never,
			body.code,
		);

		return Response.json({
			message: "Phone number verified",
			...status,
		});
	} catch (error) {
		// Same rule as phone/start: only our own failures are described.
		if (error instanceof PhoneVerificationError) {
			return errorResponse(error.code, error.status);
		}
		console.error("[phone/verify]", error);
		return errorResponse(ERROR_CODES.server, 500);
	}
}
