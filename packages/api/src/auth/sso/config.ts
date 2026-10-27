/**
 * Single sign-on to the Payload panel through Overbrand's identity provider
 * (Logto, OpenID Connect), for system administrators only: it never appears
 * in the website or the app, and never creates an account.
 *
 * Every value has Overbrand's default and an `OIDC_*` override; the client
 * id and secret have no default, and without them the button is not shown.
 */

export interface SsoConfig {
	issuer: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	userinfoEndpoint: string;
	jwksUri: string;
	clientId: string;
	clientSecret: string;
	/** The role the person must hold at the identity provider. */
	requiredRole: string;
	scopes: string;
	/** The provider's name on the panel's sign-in button. */
	label: string;
	/** The button's icon: a path the API serves, or a full URL. */
	icon: string;
}

export const OIDC_DEFAULTS = {
	issuer: "https://auth.overbrand.net/oidc",
	requiredRole: "bunSellemAdmin",
	scopes: "openid profile email roles",
	label: "Overbrand",
	/** Overbrand's mark, from its favicon, served by the API (public/sso). */
	icon: "/sso/overbrand.png",
} as const;

type Env = Record<string, string | undefined>;

function value(env: Env, name: string): string | undefined {
	const raw = env[name]?.trim();
	return raw ? raw : undefined;
}

/** The SSO's settings, or null when it is not set up. */
export function ssoConfig(env: Env): SsoConfig | null {
	const clientId = value(env, "OIDC_CLIENT_ID");
	const clientSecret = value(env, "OIDC_CLIENT_SECRET");
	if (!clientId || !clientSecret) return null;
	const issuer = (value(env, "OIDC_ISSUER") ?? OIDC_DEFAULTS.issuer).replace(
		/\/+$/,
		"",
	);
	return {
		issuer,
		// Logto's layout under its issuer, unless named otherwise.
		authorizationEndpoint:
			value(env, "OIDC_AUTHORIZATION_ENDPOINT") ?? `${issuer}/auth`,
		tokenEndpoint: value(env, "OIDC_TOKEN_ENDPOINT") ?? `${issuer}/token`,
		userinfoEndpoint: value(env, "OIDC_USERINFO_ENDPOINT") ?? `${issuer}/me`,
		jwksUri: value(env, "OIDC_JWKS_URI") ?? `${issuer}/jwks`,
		clientId,
		clientSecret,
		requiredRole:
			value(env, "OIDC_REQUIRED_ROLE") ?? OIDC_DEFAULTS.requiredRole,
		scopes: value(env, "OIDC_SCOPES") ?? OIDC_DEFAULTS.scopes,
		label: value(env, "OIDC_LABEL") ?? OIDC_DEFAULTS.label,
		icon: value(env, "OIDC_ICON") ?? OIDC_DEFAULTS.icon,
	};
}
