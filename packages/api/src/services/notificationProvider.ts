import { Novu } from "@novu/api";
import { novuApiUrl } from "@/contracts/novuEndpoints";

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

	notificationProvider = new Novu({
		secretKey,
		// Novu Cloud unless NOVU_API_URL names a self-hosted instance.
		serverURL: novuApiUrl(process.env) ?? undefined,
		// The SDK's default retries a failing call for an hour, silently: an
		// unreachable instance looked like a sync that never ended. Give up
		// after half a minute and let the caller log the real error.
		timeoutMs: 15_000,
		retryConfig: {
			strategy: "backoff",
			backoff: {
				initialInterval: 500,
				maxInterval: 5_000,
				exponent: 1.5,
				maxElapsedTime: 30_000,
			},
			retryConnectionErrors: true,
		},
	});
	return notificationProvider;
}
