import crypto from "node:crypto";
import configPromise from "@payload-config";
import { getPayload } from "payload";

export async function GET(request: Request) {
	const payload = await getPayload({ config: configPromise });
	const { user } = await payload.auth({ headers: request.headers });

	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const secretKey = process.env.NOVU_SECRET_KEY;
	if (!secretKey) {
		return Response.json({ error: "Novu not configured" }, { status: 500 });
	}

	const hash = crypto
		.createHmac("sha256", secretKey)
		.update(user.id)
		.digest("hex");

	return Response.json({ subscriberHash: hash });
}
