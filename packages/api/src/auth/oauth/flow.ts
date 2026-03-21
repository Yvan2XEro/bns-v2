import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { NextRequest } from "next/server";
import type { OAuthAudience, OAuthProvider, OAuthStatePayload } from "./types";

const MOBILE_REDIRECT_PREFIX = "buynsellem://";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const MOBILE_TRANSFER_TTL_SECONDS = 2 * 60;

function getSecretKey(): Uint8Array {
	const secret = process.env.PAYLOAD_SECRET;
	if (!secret) {
		throw new Error("PAYLOAD_SECRET environment variable is not set");
	}
	return new TextEncoder().encode(secret);
}

export function getOAuthCallbackURL(
	request: NextRequest,
	provider: OAuthProvider,
	preferredBaseURL?: string,
): string {
	if (preferredBaseURL) {
		return new URL(
			`/api/public/auth/oauth/${provider}/callback`,
			preferredBaseURL,
		).toString();
	}

	const configuredPublicServerURL =
		process.env.PAYLOAD_PUBLIC_SERVER_URL?.trim();

	if (configuredPublicServerURL) {
		return new URL(
			`/api/public/auth/oauth/${provider}/callback`,
			configuredPublicServerURL,
		).toString();
	}

	const forwardedHost = request.headers.get("x-forwarded-host");

	if (forwardedHost) {
		const host = forwardedHost.split(",")[0]?.trim();
		const forwardedProto =
			request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
			"https";

		if (host) {
			return new URL(
				`/api/public/auth/oauth/${provider}/callback`,
				`${forwardedProto}://${host}`,
			).toString();
		}
	}

	return new URL(
		`/api/public/auth/oauth/${provider}/callback`,
		request.url,
	).toString();
}

export function getPublicRequestOrigin(request: NextRequest): string {
	const forwardedHost = request.headers.get("x-forwarded-host");

	if (forwardedHost) {
		const host = forwardedHost.split(",")[0]?.trim();
		const forwardedProto =
			request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
			"https";

		if (host) {
			return `${forwardedProto}://${host}`;
		}
	}

	if (process.env.PAYLOAD_PUBLIC_SERVER_URL?.trim()) {
		return process.env.PAYLOAD_PUBLIC_SERVER_URL.trim();
	}

	return new URL(request.url).origin;
}

export function getOAuthStateCookieName(provider: OAuthProvider): string {
	return `oauth-state-${provider}`;
}

export function getOAuthStateCookieValue(payload: OAuthStatePayload): string {
	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function parseOAuthStateCookie(
	value?: string,
): null | OAuthStatePayload {
	if (!value) return null;

	try {
		const decoded = Buffer.from(value, "base64url").toString("utf-8");
		return JSON.parse(decoded) as OAuthStatePayload;
	} catch {
		return null;
	}
}

export function createOAuthState(options: {
	audience: OAuthAudience;
	initiatedFrom?: string;
	mobileRedirectUri?: string;
	redirectTo: string;
	returnTo?: string;
}): OAuthStatePayload {
	return {
		audience: options.audience,
		initiatedFrom: options.initiatedFrom,
		mobileRedirectUri: options.mobileRedirectUri,
		redirectTo: options.redirectTo,
		returnTo: options.returnTo,
		state: randomUUID(),
	};
}

export function getOAuthStateCookieOptions() {
	return {
		httpOnly: true,
		maxAge: OAUTH_STATE_TTL_SECONDS,
		path: "/",
		sameSite: "lax" as const,
		secure: process.env.NODE_ENV === "production",
	};
}

export function getOAuthErrorRedirectPath(
	redirectTo: string,
	error: string,
): string {
	const target = isAllowedAbsoluteRedirect(redirectTo)
		? new URL(redirectTo)
		: new URL(sanitizeRedirectPath(redirectTo, "/"), "http://localhost");
	target.searchParams.set("oauthError", error);
	return target.origin === "http://localhost"
		? `${target.pathname}${target.search}`
		: target.toString();
}

export function sanitizeRedirectPath(
	value: null | string | undefined,
	fallback = "/",
): string {
	if (!value || !value.startsWith("/") || value.startsWith("//")) {
		return fallback;
	}

	return value;
}

function getAllowedRedirectOrigins(): string[] {
	const configuredOrigins = process.env.PAYLOAD_ALLOWED_ORIGINS?.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

	return configuredOrigins ?? [];
}

export function getDefaultAllowedRedirect(fallbackPath = "/"): string {
	const firstAllowedOrigin = getAllowedRedirectOrigins()[0];

	if (!firstAllowedOrigin) {
		return fallbackPath;
	}

	return new URL(fallbackPath, firstAllowedOrigin).toString();
}

export function isAllowedAbsoluteRedirect(
	value: null | string | undefined,
): value is string {
	if (!value) {
		return false;
	}

	try {
		const url = new URL(value);
		return getAllowedRedirectOrigins().includes(url.origin);
	} catch {
		return false;
	}
}

export function sanitizeAbsoluteRedirect(
	value: null | string | undefined,
): null | string {
	if (!isAllowedAbsoluteRedirect(value)) {
		return null;
	}

	return value;
}

export function sanitizeInitiatedFrom(
	request: NextRequest,
	value: null | string | undefined,
): null | string {
	if (!value) {
		return null;
	}

	try {
		const url = new URL(value);
		const requestURL = new URL(request.url);

		if (url.origin === requestURL.origin) {
			return `${url.pathname}${url.search}`;
		}

		if (isAllowedAbsoluteRedirect(value)) {
			return value;
		}

		return null;
	} catch {
		return null;
	}
}

export function sanitizeMobileRedirectUri(
	value: null | string | undefined,
): null | string {
	if (!value || !value.startsWith(MOBILE_REDIRECT_PREFIX)) {
		return null;
	}

	return value;
}

export async function createMobileTransferToken(payload: {
	exp: number;
	provider: OAuthProvider;
	userId: string;
}): Promise<string> {
	const now = Math.floor(Date.now() / 1000);

	return new SignJWT({
		provider: payload.provider,
		purpose: "mobile-oauth",
		userId: payload.userId,
	})
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.setIssuedAt(now)
		.setExpirationTime(now + MOBILE_TRANSFER_TTL_SECONDS)
		.sign(getSecretKey());
}

export async function verifyMobileTransferToken(token: string): Promise<{
	provider: OAuthProvider;
	userId: string;
}> {
	const verified = await jwtVerify(token, getSecretKey());
	const claims = verified.payload as {
		provider?: OAuthProvider;
		purpose?: string;
		userId?: string;
	};

	if (claims.purpose !== "mobile-oauth" || !claims.provider || !claims.userId) {
		throw new Error("Invalid mobile OAuth transfer token");
	}

	return {
		provider: claims.provider,
		userId: claims.userId,
	};
}
