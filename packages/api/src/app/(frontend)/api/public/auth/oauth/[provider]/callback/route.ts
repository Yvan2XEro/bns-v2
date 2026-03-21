import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import {
	createMobileTransferToken,
	getDefaultAllowedRedirect,
	getOAuthErrorRedirectPath,
	getOAuthStateCookieName,
	getOAuthStateCookieOptions,
	getPublicRequestOrigin,
	isAllowedAbsoluteRedirect,
	parseOAuthStateCookie,
	sanitizeRedirectPath,
} from "@/auth/oauth/flow";
import { getOAuthProvider, isOAuthProvider } from "@/auth/oauth/providers";
import { issuePayloadSession } from "@/auth/oauth/session";
import type { OAuthProvider } from "@/auth/oauth/types";
import { resolveOAuthUser } from "@/auth/oauth/users";

function getMobileErrorRedirect(mobileRedirectUri: string, error: string): URL {
	const url = new URL(mobileRedirectUri);
	url.searchParams.set("oauthError", error);
	return url;
}

function resolveRedirectURL(request: NextRequest, target: string): URL {
	if (isAllowedAbsoluteRedirect(target)) {
		return new URL(target);
	}

	return new URL(target, getPublicRequestOrigin(request));
}

function clearOAuthStateCookie(
	response: NextResponse,
	provider: OAuthProvider,
) {
	response.cookies.set(getOAuthStateCookieName(provider), "", {
		...getOAuthStateCookieOptions(),
		maxAge: 0,
	});
}

async function handleCallback(
	request: NextRequest,
	provider: string,
	params: {
		code: null | string;
		error: null | string;
		rawUser?: null | string;
		state: null | string;
	},
) {
	if (!isOAuthProvider(provider)) {
		return Response.json(
			{ error: "Unsupported OAuth provider" },
			{ status: 404 },
		);
	}

	const stateCookie = request.cookies.get(getOAuthStateCookieName(provider));
	const state = parseOAuthStateCookie(stateCookie?.value);
	const successRedirect =
		state?.audience === "web" && isAllowedAbsoluteRedirect(state?.returnTo)
			? state.returnTo
			: sanitizeRedirectPath(
					state?.redirectTo,
					state?.audience === "admin" ? "/admin" : "/",
				);
	const errorRedirect =
		state?.initiatedFrom ??
		(state?.audience === "web"
			? (state?.returnTo ?? getDefaultAllowedRedirect("/"))
			: successRedirect);

	if (!state || !params.state || state.state !== params.state) {
		return NextResponse.redirect(
			resolveRedirectURL(
				request,
				getOAuthErrorRedirectPath(errorRedirect, "invalid_state"),
			),
		);
	}

	if (params.error) {
		if (state.audience === "mobile" && state.mobileRedirectUri) {
			const response = NextResponse.redirect(
				getMobileErrorRedirect(state.mobileRedirectUri, params.error),
			);
			clearOAuthStateCookie(response, provider);
			return response;
		}

		return NextResponse.redirect(
			resolveRedirectURL(
				request,
				getOAuthErrorRedirectPath(errorRedirect, params.error),
			),
		);
	}

	if (!params.code) {
		return NextResponse.redirect(
			resolveRedirectURL(
				request,
				getOAuthErrorRedirectPath(errorRedirect, "missing_code"),
			),
		);
	}

	try {
		const payload = await getPayload({ config });
		const identity = await getOAuthProvider(provider).exchangeCodeForIdentity({
			code: params.code,
			rawUser: params.rawUser,
			redirectUri: state.callbackURL,
		});
		const user = await resolveOAuthUser(payload, identity, {
			audience: state.audience === "admin" ? "admin" : "app",
		});
		const { cookie, exp } = await issuePayloadSession(payload, user);

		if (state.audience === "mobile" && state.mobileRedirectUri) {
			const transferToken = await createMobileTransferToken({
				exp,
				provider,
				userId: user.id,
			});
			const mobileURL = new URL(state.mobileRedirectUri);
			mobileURL.searchParams.set("transferToken", transferToken);
			const response = NextResponse.redirect(mobileURL);
			clearOAuthStateCookie(response, provider);
			return response;
		}

		const response = NextResponse.redirect(
			isAllowedAbsoluteRedirect(successRedirect)
				? successRedirect
				: resolveRedirectURL(request, successRedirect),
		);
		clearOAuthStateCookie(response, provider);
		response.headers.append("Set-Cookie", cookie);
		return response;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "oauth_callback_failed";

		if (state.audience === "mobile" && state.mobileRedirectUri) {
			const response = NextResponse.redirect(
				getMobileErrorRedirect(state.mobileRedirectUri, message),
			);
			clearOAuthStateCookie(response, provider);
			return response;
		}

		const response = NextResponse.redirect(
			resolveRedirectURL(
				request,
				getOAuthErrorRedirectPath(errorRedirect, message),
			),
		);
		clearOAuthStateCookie(response, provider);
		return response;
	}
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { provider } = await params;
	return handleCallback(request, provider, {
		code: request.nextUrl.searchParams.get("code"),
		error: request.nextUrl.searchParams.get("error"),
		state: request.nextUrl.searchParams.get("state"),
	});
}

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { provider } = await params;
	const formData = await request.formData();

	return handleCallback(request, provider, {
		code: formData.get("code")?.toString() ?? null,
		error: formData.get("error")?.toString() ?? null,
		rawUser: formData.get("user")?.toString() ?? null,
		state: formData.get("state")?.toString() ?? null,
	});
}
