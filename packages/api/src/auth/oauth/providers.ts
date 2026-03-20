import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import type { OAuthIdentity, OAuthProvider } from "./types";

type TokenResponse = Record<string, unknown> & {
	access_token?: string;
	id_token?: string;
};

type CallbackParams = {
	code: string;
	rawUser?: string | null;
	redirectUri: string;
};

interface OAuthProviderDefinition {
	buildAuthorizationURL: (args: {
		redirectUri: string;
		state: string;
	}) => string;
	exchangeCodeForIdentity: (args: CallbackParams) => Promise<OAuthIdentity>;
	isConfigured: () => boolean;
}

const GOOGLE_SCOPES = ["openid", "email", "profile"].join(" ");
const FACEBOOK_SCOPES = ["email", "public_profile"].join(",");
const APPLE_SCOPES = ["name", "email"].join(" ");
const APPLE_JWKS = createRemoteJWKSet(
	new URL("https://appleid.apple.com/auth/keys"),
);

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing environment variable: ${name}`);
	}
	return value;
}

async function exchangeCode(
	url: string,
	body: URLSearchParams,
): Promise<TokenResponse> {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});

	if (!response.ok) {
		const detail = await response.text().catch(() => "");
		throw new Error(
			`OAuth token exchange failed: ${response.status} ${detail}`,
		);
	}

	return (await response.json()) as TokenResponse;
}

async function getGoogleIdentity({
	code,
	redirectUri,
}: CallbackParams): Promise<OAuthIdentity> {
	const token = await exchangeCode(
		"https://oauth2.googleapis.com/token",
		new URLSearchParams({
			client_id: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
			client_secret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
			code,
			grant_type: "authorization_code",
			redirect_uri: redirectUri,
		}),
	);

	if (!token.access_token) {
		throw new Error("Google token exchange did not return an access token");
	}

	const response = await fetch(
		"https://openidconnect.googleapis.com/v1/userinfo",
		{
			headers: {
				Authorization: `Bearer ${token.access_token}`,
			},
		},
	);

	if (!response.ok) {
		const detail = await response.text().catch(() => "");
		throw new Error(
			`Google userinfo lookup failed: ${response.status} ${detail}`,
		);
	}

	const profile = (await response.json()) as {
		email?: string;
		email_verified?: boolean;
		name?: string;
		picture?: string;
		sub?: string;
	};

	if (!profile.sub) {
		throw new Error("Google userinfo payload is missing sub");
	}

	return {
		avatarUrl: profile.picture,
		email: profile.email?.toLowerCase(),
		emailVerified: Boolean(profile.email_verified),
		name: profile.name,
		provider: "google",
		providerAccountId: profile.sub,
	};
}

function normalizeApplePrivateKey(): string {
	return requiredEnv("APPLE_OAUTH_PRIVATE_KEY").replace(/\\n/g, "\n");
}

async function createAppleClientSecret(): Promise<string> {
	const privateKey = await importPKCS8(normalizeApplePrivateKey(), "ES256");
	const now = Math.floor(Date.now() / 1000);

	return new SignJWT({})
		.setProtectedHeader({
			alg: "ES256",
			kid: requiredEnv("APPLE_OAUTH_KEY_ID"),
		})
		.setIssuer(requiredEnv("APPLE_OAUTH_TEAM_ID"))
		.setIssuedAt(now)
		.setAudience("https://appleid.apple.com")
		.setSubject(requiredEnv("APPLE_OAUTH_CLIENT_ID"))
		.setExpirationTime(now + 60 * 60)
		.sign(privateKey);
}

async function getAppleIdentity({
	code,
	rawUser,
	redirectUri,
}: CallbackParams): Promise<OAuthIdentity> {
	const clientId = requiredEnv("APPLE_OAUTH_CLIENT_ID");
	const clientSecret = await createAppleClientSecret();

	const token = await exchangeCode(
		"https://appleid.apple.com/auth/token",
		new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			grant_type: "authorization_code",
			redirect_uri: redirectUri,
		}),
	);

	if (!token.id_token) {
		throw new Error("Apple token exchange did not return an id_token");
	}

	const verified = await jwtVerify(token.id_token, APPLE_JWKS, {
		audience: clientId,
		issuer: "https://appleid.apple.com",
	});

	const claims = verified.payload as {
		email?: string;
		email_verified?: boolean | string;
		sub?: string;
	};

	if (!claims.sub) {
		throw new Error("Apple id_token is missing sub");
	}

	const parsedUser = rawUser?.trim()
		? (JSON.parse(rawUser) as {
				name?: { firstName?: string; lastName?: string };
			})
		: null;

	const displayName = [parsedUser?.name?.firstName, parsedUser?.name?.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();

	return {
		email: claims.email?.toLowerCase(),
		emailVerified:
			claims.email_verified === true || claims.email_verified === "true",
		name: displayName || claims.email?.split("@")[0] || "Apple user",
		provider: "apple",
		providerAccountId: claims.sub,
	};
}

async function getFacebookIdentity({
	code,
	redirectUri,
}: CallbackParams): Promise<OAuthIdentity> {
	const appId = requiredEnv("FACEBOOK_OAUTH_APP_ID");
	const appSecret = requiredEnv("FACEBOOK_OAUTH_APP_SECRET");

	const token = await exchangeCode(
		"https://graph.facebook.com/v23.0/oauth/access_token",
		new URLSearchParams({
			client_id: appId,
			client_secret: appSecret,
			code,
			redirect_uri: redirectUri,
		}),
	);

	if (!token.access_token) {
		throw new Error("Facebook token exchange did not return an access token");
	}

	const appAccessToken = `${appId}|${appSecret}`;
	const debugResponse = await fetch(
		`https://graph.facebook.com/debug_token?${new URLSearchParams({
			access_token: appAccessToken,
			input_token: token.access_token,
		}).toString()}`,
	);

	if (!debugResponse.ok) {
		const detail = await debugResponse.text().catch(() => "");
		throw new Error(
			`Facebook token verification failed: ${debugResponse.status} ${detail}`,
		);
	}

	const debugData = (await debugResponse.json()) as {
		data?: { app_id?: string; is_valid?: boolean; user_id?: string };
	};

	if (!debugData.data?.is_valid || debugData.data.app_id !== appId) {
		throw new Error("Facebook access token is not valid for this app");
	}

	const profileResponse = await fetch(
		`https://graph.facebook.com/me?${new URLSearchParams({
			access_token: token.access_token,
			fields: "id,name,email,picture.type(large)",
		}).toString()}`,
	);

	if (!profileResponse.ok) {
		const detail = await profileResponse.text().catch(() => "");
		throw new Error(
			`Facebook profile lookup failed: ${profileResponse.status} ${detail}`,
		);
	}

	const profile = (await profileResponse.json()) as {
		email?: string;
		id?: string;
		name?: string;
		picture?: { data?: { url?: string } };
	};

	if (!profile.id) {
		throw new Error("Facebook profile payload is missing id");
	}

	return {
		avatarUrl: profile.picture?.data?.url,
		email: profile.email?.toLowerCase(),
		emailVerified: Boolean(profile.email),
		name: profile.name,
		provider: "facebook",
		providerAccountId: profile.id,
	};
}

const PROVIDERS: Record<OAuthProvider, OAuthProviderDefinition> = {
	apple: {
		buildAuthorizationURL: ({ redirectUri, state }) => {
			const url = new URL("https://appleid.apple.com/auth/authorize");
			url.searchParams.set("client_id", requiredEnv("APPLE_OAUTH_CLIENT_ID"));
			url.searchParams.set("redirect_uri", redirectUri);
			url.searchParams.set("response_mode", "form_post");
			url.searchParams.set("response_type", "code");
			url.searchParams.set("scope", APPLE_SCOPES);
			url.searchParams.set("state", state);
			return url.toString();
		},
		exchangeCodeForIdentity: getAppleIdentity,
		isConfigured: () =>
			Boolean(
				process.env.APPLE_OAUTH_CLIENT_ID &&
					process.env.APPLE_OAUTH_TEAM_ID &&
					process.env.APPLE_OAUTH_KEY_ID &&
					process.env.APPLE_OAUTH_PRIVATE_KEY,
			),
	},
	facebook: {
		buildAuthorizationURL: ({ redirectUri, state }) => {
			const url = new URL("https://www.facebook.com/v23.0/dialog/oauth");
			url.searchParams.set("client_id", requiredEnv("FACEBOOK_OAUTH_APP_ID"));
			url.searchParams.set("redirect_uri", redirectUri);
			url.searchParams.set("response_type", "code");
			url.searchParams.set("scope", FACEBOOK_SCOPES);
			url.searchParams.set("state", state);
			return url.toString();
		},
		exchangeCodeForIdentity: getFacebookIdentity,
		isConfigured: () =>
			Boolean(
				process.env.FACEBOOK_OAUTH_APP_ID &&
					process.env.FACEBOOK_OAUTH_APP_SECRET,
			),
	},
	google: {
		buildAuthorizationURL: ({ redirectUri, state }) => {
			const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
			url.searchParams.set("client_id", requiredEnv("GOOGLE_OAUTH_CLIENT_ID"));
			url.searchParams.set("prompt", "select_account");
			url.searchParams.set("redirect_uri", redirectUri);
			url.searchParams.set("response_type", "code");
			url.searchParams.set("scope", GOOGLE_SCOPES);
			url.searchParams.set("state", state);
			return url.toString();
		},
		exchangeCodeForIdentity: getGoogleIdentity,
		isConfigured: () =>
			Boolean(
				process.env.GOOGLE_OAUTH_CLIENT_ID &&
					process.env.GOOGLE_OAUTH_CLIENT_SECRET,
			),
	},
};

export function getOAuthProvider(provider: string): OAuthProviderDefinition {
	if (!(provider in PROVIDERS)) {
		throw new Error(`Unsupported OAuth provider: ${provider}`);
	}

	return PROVIDERS[provider as OAuthProvider];
}

export function isOAuthProvider(provider: string): provider is OAuthProvider {
	return provider in PROVIDERS;
}

export function listConfiguredOAuthProviders(): OAuthProvider[] {
	return (Object.keys(PROVIDERS) as OAuthProvider[]).filter((provider) =>
		PROVIDERS[provider].isConfigured(),
	);
}
