import { type NextRequest, NextResponse } from "next/server";
import { getPublicRequestOrigin } from "@/auth/oauth/flow";
import { ssoConfig } from "@/auth/sso/config";
import {
	authorizationUrl,
	encodePending,
	newPendingLogin,
	pendingCookieOptions,
	SSO_COOKIE,
	ssoCallbackUrl,
} from "@/auth/sso/flow";

/** Sends the browser to the identity provider, PKCE and nonce in hand. */
export function GET(request: NextRequest) {
	const config = ssoConfig(process.env);
	if (!config) {
		return NextResponse.redirect(
			new URL("/admin/login?oauthError=sso_not_configured", request.url),
		);
	}
	const pending = newPendingLogin();
	const response = NextResponse.redirect(
		authorizationUrl(
			config,
			pending,
			ssoCallbackUrl(getPublicRequestOrigin(request)),
		),
	);
	response.cookies.set(
		SSO_COOKIE,
		encodePending(pending),
		pendingCookieOptions,
	);
	return response;
}
