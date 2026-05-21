/**
 * Public runtime configuration served to web and mobile clients.
 * Only genuinely publishable values go here — no secrets.
 * Clients fetch this once at startup to avoid baking keys into builds.
 */
import config from "@payload-config";
import { getPayload } from "payload";
import { listConfiguredOAuthProviders } from "@/auth/oauth/providers";

export async function GET() {
	let enabledAuthProviders: string[] = [];
	let localAuthEnabled = true;

	try {
		const payload = await getPayload({ config });
		const settings = await payload.findGlobal({ slug: "app-settings" });
		const authSettings = (
			settings as unknown as {
				auth?: { enabledProviders?: string[]; enableLocalAuth?: boolean };
			}
		)?.auth;

		const configured = listConfiguredOAuthProviders();
		const enabledInAdmin = authSettings?.enabledProviders ?? [
			"google",
			"apple",
			"facebook",
		];
		enabledAuthProviders = configured.filter((p) => enabledInAdmin.includes(p));
		localAuthEnabled = authSettings?.enableLocalAuth ?? true;
	} catch {
		enabledAuthProviders = listConfiguredOAuthProviders();
	}

	return Response.json({
		stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
		chatUrl: process.env.CHAT_PUBLIC_URL ?? null,
		novuAppId: process.env.NOVU_APPLICATION_IDENTIFIER ?? null,
		webUrl: process.env.PUBLIC_WEB_URL ?? null,
		enabledAuthProviders,
		localAuthEnabled,
	});
}
