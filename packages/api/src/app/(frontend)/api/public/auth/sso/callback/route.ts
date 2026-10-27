import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { getPublicRequestOrigin } from "@/auth/oauth/flow";
import { issuePayloadSession } from "@/auth/oauth/session";
import { ssoAccess } from "@/auth/sso/access";
import { ssoConfig } from "@/auth/sso/config";
import {
	decodePending,
	SSO_COOKIE,
	ssoCallbackUrl,
	verifiedClaims,
} from "@/auth/sso/flow";
import { resolveSsoUser } from "@/auth/sso/users";

function toPanel(request: NextRequest, error?: string) {
	const origin = getPublicRequestOrigin(request);
	const target = error
		? new URL(`/admin/login?oauthError=${encodeURIComponent(error)}`, origin)
		: new URL("/admin", origin);
	const response = NextResponse.redirect(target);
	response.cookies.delete({ name: SSO_COOKIE, path: "/api/public/auth/sso" });
	return response;
}

/**
 * Back from the identity provider: checks the state, verifies the ID token,
 * requires the role, then opens a Payload session on the BuyNSellem
 * administrator account linked to that identity — never another account.
 */
export async function GET(request: NextRequest) {
	const settings = ssoConfig(process.env);
	if (!settings) return toPanel(request, "sso_not_configured");

	const params = request.nextUrl.searchParams;
	if (params.get("error")) return toPanel(request, "sso_cancelled");

	const pending = decodePending(request.cookies.get(SSO_COOKIE)?.value);
	const code = params.get("code");
	if (!pending || !code || params.get("state") !== pending.state) {
		return toPanel(request, "sso_state_mismatch");
	}

	const payload = await getPayload({ config });
	try {
		const claims = await verifiedClaims(
			settings,
			pending,
			code,
			ssoCallbackUrl(getPublicRequestOrigin(request)),
		);
		const access = ssoAccess(claims, settings.requiredRole);
		if (!access.allowed) throw new Error(access.reason);

		const user = await resolveSsoUser(payload, access);
		const { cookie } = await issuePayloadSession(payload, user);
		payload.logger.info({ msg: "[sso] signed in", userId: user.id });

		const response = toPanel(request);
		response.headers.append("Set-Cookie", cookie);
		return response;
	} catch (error) {
		const reason = error instanceof Error ? error.message : "sso_failed";
		// Refusals are worth seeing: someone tried to reach the panel.
		payload.logger.warn({ msg: "[sso] refused", reason });
		return toPanel(request, `sso_${reason}`.replace(/^sso_sso_/, "sso_"));
	}
}
