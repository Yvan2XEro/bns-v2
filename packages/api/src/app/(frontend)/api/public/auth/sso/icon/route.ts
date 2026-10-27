import { type NextRequest, NextResponse } from "next/server";
import { getPublicRequestOrigin } from "@/auth/oauth/flow";
import { OIDC_DEFAULTS, ssoConfig } from "@/auth/sso/config";

/**
 * The SSO button's icon (OIDC_ICON), reachable under /api from any client.
 * A path is the API's own file, so it resolves on the API's public address —
 * not on the website's, which relays /api and nothing else.
 */
export function GET(request: NextRequest) {
	const icon = ssoConfig(process.env)?.icon ?? OIDC_DEFAULTS.icon;
	const apiOrigin =
		process.env.PAYLOAD_PUBLIC_SERVER_URL?.trim() ||
		getPublicRequestOrigin(request);
	return NextResponse.redirect(new URL(icon, apiOrigin), {
		headers: { "Cache-Control": "public, max-age=86400" },
	});
}
