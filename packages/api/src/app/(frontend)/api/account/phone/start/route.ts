import config from "@payload-config";
import { getPayload } from "payload";
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
			return Response.json({ message: "Unauthorized" }, { status: 401 });
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
		const message =
			error instanceof Error
				? error.message
				: "Unable to start phone verification";
		const status = error instanceof PhoneVerificationError ? error.status : 500;

		return Response.json({ message }, { status });
	}
}
