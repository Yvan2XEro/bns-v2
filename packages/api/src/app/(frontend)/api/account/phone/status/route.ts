import config from "@payload-config";
import { getPayload } from "payload";
import {
	getPhoneVerificationStatus,
	type PhoneVerificationError,
} from "@/services/phoneVerification";

export async function GET(request: Request) {
	try {
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

		return Response.json(getPhoneVerificationStatus(userDoc as never));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to load phone status";
		const status =
			typeof (error as PhoneVerificationError | undefined)?.status === "number"
				? (error as PhoneVerificationError).status
				: 500;

		return Response.json({ message }, { status });
	}
}
