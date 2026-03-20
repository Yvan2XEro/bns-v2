import config from "@payload-config";
import { getPayload } from "payload";
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
			return Response.json({ message: "Unauthorized" }, { status: 401 });
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
		const message =
			error instanceof Error ? error.message : "Unable to verify phone number";
		const status = error instanceof PhoneVerificationError ? error.status : 500;

		return Response.json({ message }, { status });
	}
}
