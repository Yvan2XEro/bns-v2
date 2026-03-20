import { Novu } from "@novu/api";

let notificationProvider: Novu | null = null;

export function isNotificationProviderConfigured(): boolean {
	return Boolean(process.env.NOVU_SECRET_KEY);
}

export function getNotificationProvider(): Novu {
	if (notificationProvider) return notificationProvider;

	const secretKey = process.env.NOVU_SECRET_KEY;
	if (!secretKey) {
		throw new Error("NOVU_SECRET_KEY environment variable is not set");
	}

	notificationProvider = new Novu({ secretKey });
	return notificationProvider;
}
