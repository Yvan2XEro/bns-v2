/**
 * Public runtime configuration served to web and mobile clients.
 * Only genuinely publishable values go here — no secrets.
 * Clients fetch this once at startup to avoid baking keys into builds.
 */
export async function GET() {
	return Response.json({
		stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
		chatUrl: process.env.CHAT_PUBLIC_URL ?? null,
		novuAppId: process.env.NOVU_APPLICATION_IDENTIFIER ?? null,
		webUrl: process.env.PUBLIC_WEB_URL ?? null,
	});
}
