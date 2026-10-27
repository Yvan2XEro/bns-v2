import { type NextRequest, NextResponse } from "next/server";
import {
	getPublicRequestOrigin,
	sanitizeAbsoluteRedirect,
} from "@/auth/oauth/flow";
import { ssoConfig } from "@/auth/sso/config";
import {
	authorizationUrl,
	encodePending,
	newPendingLogin,
	pendingCookieOptions,
	SSO_COOKIE,
	ssoCallbackUrl,
} from "@/auth/sso/flow";

/**
 * Sends the browser to the identity provider, PKCE and nonce in hand. From
 * the website, `returnTo` (one of its allowed addresses) is where the person
 * lands once signed in; without it, the Payload panel.
 */
export function GET(request: NextRequest) {
	const config = ssoConfig(process.env);
	// The public address, not request.url: behind the proxy that is the
	// container's own (https://0.0.0.0:3000).
	const origin = getPublicRequestOrigin(request);
	const returnTo = sanitizeAbsoluteRedirect(
		request.nextUrl.searchParams.get("returnTo"),
	);
	if (!config) {
		const login = returnTo
			? new URL("/auth/login", returnTo)
			: new URL("/admin/login", origin);
		login.searchParams.set("oauthError", "sso_not_configured");
		return NextResponse.redirect(login);
	}
	const pending = newPendingLogin(ssoCallbackUrl(origin, returnTo), returnTo);
	const response = NextResponse.redirect(authorizationUrl(config, pending));
	response.cookies.set(
		SSO_COOKIE,
		encodePending(pending),
		pendingCookieOptions,
	);
	return response;
}
