import config from "@payload-config";
import { getPayload } from "payload";
import { listConfiguredOAuthProviders } from "@/auth/oauth/providers";

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

		const providers = configured.filter((p) => enabledInAdmin.includes(p));
		return Response.json({ providers });
	} catch {
		return Response.json({ providers: configured });
	}
}
