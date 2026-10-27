import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import type { SsoConfig } from "./config";

/** Holds the login in flight between the redirect and the callback. */
export const SSO_COOKIE = "bns-sso";
const TTL_SECONDS = 10 * 60;

export interface PendingLogin {
	state: string;
	nonce: string;
	codeVerifier: string;
}

function randomToken(): string {
	return randomBytes(32).toString("base64url");
}

export function newPendingLogin(): PendingLogin {
	return {
		state: randomToken(),
		nonce: randomToken(),
		codeVerifier: randomToken(),
	};
}

export function encodePending(pending: PendingLogin): string {
	return Buffer.from(JSON.stringify(pending)).toString("base64url");
}

export function decodePending(raw: string | undefined): PendingLogin | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
		return typeof value?.state === "string" &&
			typeof value.nonce === "string" &&
			typeof value.codeVerifier === "string"
			? value
			: null;
	} catch {
		return null;
	}
}

export const pendingCookieOptions = {
	httpOnly: true,
	maxAge: TTL_SECONDS,
	path: "/api/public/auth/sso",
	sameSite: "lax" as const,
	secure: process.env.NODE_ENV === "production",
};

/** The identity provider's sign-in page, with PKCE (S256). */
export function authorizationUrl(
	config: SsoConfig,
	pending: PendingLogin,
	redirectUri: string,
): string {
	const url = new URL(config.authorizationEndpoint);
	url.searchParams.set("client_id", config.clientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", config.scopes);
	url.searchParams.set("state", pending.state);
	url.searchParams.set("nonce", pending.nonce);
	url.searchParams.set(
		"code_challenge",
		createHash("sha256").update(pending.codeVerifier).digest("base64url"),
	);
	url.searchParams.set("code_challenge_method", "S256");
	return url.toString();
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function keySet(jwksUri: string) {
	let set = keySets.get(jwksUri);
	if (!set) {
		set = createRemoteJWKSet(new URL(jwksUri));
		keySets.set(jwksUri, set);
	}
	return set;
}

/**
 * Exchanges the code and returns the verified ID token's claims — signature
 * against the provider's keys, issuer, audience and nonce — completed by the
 * userinfo endpoint when the token leaves out the roles.
 */
export async function verifiedClaims(
	config: SsoConfig,
	pending: PendingLogin,
	code: string,
	redirectUri: string,
): Promise<JWTPayload> {
	const response = await fetch(config.tokenEndpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: `Basic ${Buffer.from(
				`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`,
			).toString("base64")}`,
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			code_verifier: pending.codeVerifier,
		}),
	});
	if (!response.ok) {
		throw new Error(`token_exchange_failed_${response.status}`);
	}
	const tokens = (await response.json()) as {
		id_token?: string;
		access_token?: string;
	};
	if (!tokens.id_token) throw new Error("no_id_token");

	const { payload: claims } = await jwtVerify(
		tokens.id_token,
		keySet(config.jwksUri),
		{ issuer: config.issuer, audience: config.clientId },
	);
	if (claims.nonce !== pending.nonce) throw new Error("nonce_mismatch");

	if (claims.roles === undefined && tokens.access_token) {
		const info = await fetch(config.userinfoEndpoint, {
			headers: { Authorization: `Bearer ${tokens.access_token}` },
		});
		if (info.ok) {
			const extra = (await info.json()) as Record<string, unknown>;
			// The ID token's subject is the one verified: userinfo only adds.
			if (extra.sub === claims.sub)
				return { ...extra, ...claims, roles: extra.roles };
		}
	}
	return claims;
}

export const SSO_CALLBACK_PATH = "/api/public/auth/sso/callback";

/**
 * Where the identity provider sends the browser back: the API's public
 * address when configured (stable, as the provider compares it to the one
 * registered), else the address the request came in on.
 */
export function ssoCallbackUrl(requestOrigin: string): string {
	const base = process.env.PAYLOAD_PUBLIC_SERVER_URL?.trim() || requestOrigin;
	return new URL(SSO_CALLBACK_PATH, base).toString();
}
