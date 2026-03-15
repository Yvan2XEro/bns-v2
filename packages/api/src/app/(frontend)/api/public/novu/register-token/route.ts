import configPromise from "@payload-config";
import { getPayload } from "payload";

const NOVU_API_URL = process.env.NOVU_API_URL ?? "https://api.novu.co";

export async function POST(request: Request) {
	const payload = await getPayload({ config: configPromise });
	const { user } = await payload.auth({ headers: request.headers });

	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const secretKey = process.env.NOVU_SECRET_KEY;
	if (!secretKey) {
		return Response.json({ error: "Novu not configured" }, { status: 500 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { token } = body as { token?: string };
	if (!token || typeof token !== "string") {
		return Response.json({ error: "token is required" }, { status: 400 });
	}

	// Ensure subscriber exists
	await fetch(`${NOVU_API_URL}/v1/subscribers`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `ApiKey ${secretKey}`,
		},
		body: JSON.stringify({
			subscriberId: user.id,
			email: user.email,
			firstName: user.name,
		}),
	});

	// Register Expo push token as device credential
	const credResponse = await fetch(
		`${NOVU_API_URL}/v1/subscribers/${user.id}/credentials`,
		{
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Authorization: `ApiKey ${secretKey}`,
			},
			body: JSON.stringify({
				providerId: "expo",
				credentials: { deviceTokens: [token] },
			}),
		},
	);

	if (!credResponse.ok) {
		console.error(
			"[novu] Failed to register push token:",
			await credResponse.text(),
		);
		return Response.json(
			{ error: "Failed to register token" },
			{ status: 500 },
		);
	}

	return Response.json({ success: true });
}
