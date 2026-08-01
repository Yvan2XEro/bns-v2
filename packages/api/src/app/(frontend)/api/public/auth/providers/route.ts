import config from "@payload-config";
import { getPayload } from "payload";
import { resolveEnabledOAuthProviders } from "@/auth/oauth/enabledProviders";
import { listConfiguredOAuthProviders } from "@/auth/oauth/providers";

// Same reason as /api/public/config: without this the provider list is
// prerendered and stops reflecting the OAuth environment variables.
export const dynamic = "force-dynamic";

export async function GET() {
	const configured = listConfiguredOAuthProviders();

	try {
		const payload = await getPayload({ config });
		const settings = await payload.findGlobal({ slug: "app-settings" });
		const authSettings = (
			settings as unknown as {
				auth?: { enabledProviders?: string[] };
			}
		)?.auth;
		const enabledInAdmin = authSettings?.enabledProviders ?? [
			"google",
			"apple",
			"facebook",
		];

		const providers = resolveEnabledOAuthProviders(configured, enabledInAdmin);
		return Response.json({ providers });
	} catch {
		return Response.json({ providers: configured });
	}
}
