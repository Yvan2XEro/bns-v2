import { ChatOrPushProviderEnum } from "@novu/api/models/components";
import configPromise from "@payload-config";
import { getPayload } from "payload";
import { getNotificationProvider } from "../../../../../../services/notificationProvider";

export async function POST(request: Request) {
	const payload = await getPayload({ config: configPromise });
	const { user } = await payload.auth({ headers: request.headers });

	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	if (!process.env.NOVU_SECRET_KEY) {
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

	const notificationProvider = getNotificationProvider();

	// Ensure subscriber exists
	await notificationProvider.subscribers.create({
		subscriberId: user.id,
		email: user.email,
		firstName: user.name,
	});

	try {
		await notificationProvider.subscribers.credentials.update(
			{
				providerId: ChatOrPushProviderEnum.Expo,
				integrationIdentifier:
					process.env.NOVU_EXPO_INTEGRATION_IDENTIFIER || undefined,
				credentials: { deviceTokens: [token] },
			},
			user.id,
		);
	} catch (error) {
		console.error("[novu] Failed to register push token:", error);
		return Response.json(
			{ error: "Failed to register token" },
			{ status: 500 },
		);
	}

	return Response.json({ success: true });
}
