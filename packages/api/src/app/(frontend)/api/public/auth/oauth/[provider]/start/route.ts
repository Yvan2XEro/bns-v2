import { type NextRequest, NextResponse } from "next/server";
import {
	createOAuthState,
	getOAuthCallbackURL,
	getOAuthErrorRedirectPath,
	getOAuthStateCookieName,
	getOAuthStateCookieOptions,
	getOAuthStateCookieValue,
	isAllowedAbsoluteRedirect,
	sanitizeAbsoluteRedirect,
	sanitizeInitiatedFrom,
	sanitizeMobileRedirectUri,
	sanitizeRedirectPath,
} from "@/auth/oauth/flow";
import {
	getOAuthProvider,
	isOAuthProvider,
	listConfiguredOAuthProviders,
} from "@/auth/oauth/providers";
import type { OAuthAudience } from "@/auth/oauth/types";

function getFallbackRedirect(options: {
	audience: OAuthAudience;
	initiatedFrom: null | string;
	mobileRedirectUri: null | string;
	redirectTo: string;
	returnTo: null | string;
}): string {
	if (options.audience === "mobile" && options.mobileRedirectUri) {
		const url = new URL(options.mobileRedirectUri);
		return url.toString();
	}

	if (options.initiatedFrom) {
		return options.initiatedFrom;
	}

	if (
		options.audience === "web" &&
		isAllowedAbsoluteRedirect(options.returnTo)
	) {
		return options.returnTo;
	}

	return options.redirectTo;
}

function redirectWithOAuthError(
	request: NextRequest,
	options: {
		audience: OAuthAudience;
		error: string;
		initiatedFrom: null | string;
		mobileRedirectUri: null | string;
		redirectTo: string;
		returnTo: null | string;
		status?: number;
	},
) {
	const fallbackRedirect = getFallbackRedirect(options);
	const location = getOAuthErrorRedirectPath(fallbackRedirect, options.error);
	return NextResponse.redirect(
		isAllowedAbsoluteRedirect(location)
			? location
			: new URL(location, request.url),
		{ status: options.status ?? 302 },
	);
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const audience = (request.nextUrl.searchParams.get("audience") ??
		"web") as OAuthAudience;
	const redirectTo = sanitizeRedirectPath(
		request.nextUrl.searchParams.get("redirectTo"),
		audience === "admin" ? "/admin" : "/",
	);
	const mobileRedirectUri = sanitizeMobileRedirectUri(
		request.nextUrl.searchParams.get("mobileRedirectUri"),
	);
	const returnTo =
		audience === "web"
			? sanitizeAbsoluteRedirect(request.nextUrl.searchParams.get("returnTo"))
			: null;
	const initiatedFrom = sanitizeInitiatedFrom(
		request,
		request.headers.get("referer"),
	);
	const { provider } = await params;

	if (!isOAuthProvider(provider)) {
		return redirectWithOAuthError(request, {
			audience,
			error: "Unsupported OAuth provider",
			initiatedFrom,
			mobileRedirectUri,
			redirectTo,
			returnTo,
			status: 302,
		});
	}

	if (!listConfiguredOAuthProviders().includes(provider)) {
		return redirectWithOAuthError(request, {
			audience,
			error: `${provider} OAuth is not configured`,
			initiatedFrom,
			mobileRedirectUri,
			redirectTo,
			returnTo,
			status: 302,
		});
	}

	if (audience === "mobile" && !mobileRedirectUri) {
		return Response.json(
			{ error: "A valid mobileRedirectUri is required for mobile OAuth" },
			{ status: 400 },
		);
	}

	const state = createOAuthState({
		audience,
		initiatedFrom: initiatedFrom ?? undefined,
		mobileRedirectUri: mobileRedirectUri ?? undefined,
		redirectTo,
		returnTo: returnTo ?? undefined,
	});
	const authorizationURL = getOAuthProvider(provider).buildAuthorizationURL({
		redirectUri: getOAuthCallbackURL(request, provider),
		state: state.state,
	});

	const response = NextResponse.redirect(authorizationURL);
	response.cookies.set(
		getOAuthStateCookieName(provider),
		getOAuthStateCookieValue(state),
		getOAuthStateCookieOptions(),
	);

	return response;
}
