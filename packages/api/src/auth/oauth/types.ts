export type OAuthProvider = "google" | "apple" | "facebook";

export type AuthProvider = OAuthProvider | "local";

export type OAuthAudience = "web" | "mobile" | "admin";

export interface OAuthIdentity {
	provider: OAuthProvider;
	providerAccountId: string;
	email?: string;
	emailVerified?: boolean;
	name?: string;
	avatarUrl?: string;
	providerData?: {
		refreshToken?: string;
	};
}

export type OAuthResolvedAudience = "admin" | "app";

export interface OAuthStatePayload {
	audience: OAuthAudience;
	callbackURL: string;
	initiatedFrom?: string;
	mobileRedirectUri?: string;
	redirectTo: string;
	returnTo?: string;
	state: string;
}
