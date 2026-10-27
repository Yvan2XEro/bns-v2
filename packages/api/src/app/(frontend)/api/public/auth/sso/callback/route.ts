import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { getPublicRequestOrigin } from "@/auth/oauth/flow";
import { issuePayloadSession } from "@/auth/oauth/session";
import { ssoAccess } from "@/auth/sso/access";
import { ssoConfig } from "@/auth/sso/config";
import {
	decodePending,
	type PendingLogin,
	SSO_COOKIE,
	verifiedClaims,
} from "@/auth/sso/flow";
import { resolveSsoUser } from "@/auth/sso/users";

/** Back where the person started: the website, or the Payload panel. */
function finish(
	request: NextRequest,
	pending: PendingLogin | null,
	outcome: { error: string } | { cookie: string },
) {
	const returnTo = pending?.returnTo ?? null;
	let target: URL;
	if ("error" in outcome) {
		target = returnTo
			? new URL("/auth/login", returnTo)
			: new URL("/admin/login", getPublicRequestOrigin(request));
		target.searchParams.set("oauthError", outcome.error);
	} else {
		target = returnTo
			? new URL(returnTo)
			: new URL("/admin", getPublicRequestOrigin(request));
	}
	const response = NextResponse.redirect(target);
	response.cookies.delete({ name: SSO_COOKIE, path: "/api/public/auth/sso" });
	if ("cookie" in outcome)
		response.headers.append("Set-Cookie", outcome.cookie);
	return response;
}

/**
 * Back from the identity provider: checks the state, verifies the ID token,
 * requires the role, then opens a Payload session on the BuyNSellem
 * administrator account linked to that identity — never another account.
 */
export async function GET(request: NextRequest) {
	const pending = decodePending(request.cookies.get(SSO_COOKIE)?.value);
	const settings = ssoConfig(process.env);
	if (!settings)
		return finish(request, pending, { error: "sso_not_configured" });

	const params = request.nextUrl.searchParams;
	if (params.get("error")) {
		return finish(request, pending, { error: "sso_cancelled" });
	}
	const code = params.get("code");
	if (!pending || !code || params.get("state") !== pending.state) {
		return finish(request, pending, { error: "sso_state_mismatch" });
	}

	const payload = await getPayload({ config });
	try {
		const claims = await verifiedClaims(settings, pending, code);
		const access = ssoAccess(claims, settings.requiredRole);
		if (!access.allowed) throw new Error(access.reason);

		const user = await resolveSsoUser(payload, access);
		const { cookie } = await issuePayloadSession(payload, user);
		payload.logger.info({ msg: "[sso] signed in", userId: user.id });
		return finish(request, pending, { cookie });
	} catch (error) {
		const reason = error instanceof Error ? error.message : "failed";
		// Refusals are worth seeing: someone tried to reach the panel.
		payload.logger.warn({ msg: "[sso] refused", reason });
		return finish(request, pending, { error: `sso_${reason}` });
	}
}
