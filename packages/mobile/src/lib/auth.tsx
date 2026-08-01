import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import type { LoginResponse, MeResponse, UserDoc } from "@/src/types/api";
import { API_BASE_URL, ApiError, api } from "./api";

WebBrowser.maybeCompleteAuthSession();

// Re-export for convenience so other files can import User from here
export type { UserDoc as User };
export type SocialAuthProvider = "apple" | "facebook" | "google";

interface AuthContextType {
	user: UserDoc | null;
	token: string | null;
	isLoading: boolean;
	login: (email: string, password: string) => Promise<void>;
	loginWithProvider: (
		provider: SocialAuthProvider,
		redirectTo?: string,
	) => Promise<void>;
	register: (name: string, email: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
	refreshUser: () => Promise<void>;
	updateUser: (updates: Partial<UserDoc>) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<UserDoc | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	// Restore session on mount
	useEffect(() => {
		(async () => {
			try {
				const stored = await SecureStore.getItemAsync("auth_token");
				if (stored) {
					setToken(stored);
					// Payload v3: /api/users/me returns { user: {...} }
					const data = await api.get<MeResponse>("/api/users/me");
					setUser(data.user);
				}
			} catch {
				// Token is invalid or expired — clear it silently
				await SecureStore.deleteItemAsync("auth_token");
				setToken(null);
				setUser(null);
			} finally {
				setIsLoading(false);
			}
		})();
	}, []);

	const login = async (email: string, password: string): Promise<void> => {
		const data = await api.post<LoginResponse>("/api/users/login", {
			email,
			password,
		});
		await SecureStore.setItemAsync("auth_token", data.token);
		setToken(data.token);
		setUser(data.user);
	};

	/**
	 * Native Sign in with Apple (the Face ID sheet), used on iOS.
	 *
	 * Returns `false` when the flow is unavailable rather than throwing, so the
	 * caller can fall back to the browser flow — e.g. when the backend has no
	 * APPLE_NATIVE_CLIENT_ID configured and answers 501.
	 */
	const loginWithAppleNative = async (): Promise<boolean> => {
		if (Platform.OS !== "ios") return false;
		if (!(await AppleAuthentication.isAvailableAsync())) return false;

		let credential: AppleAuthentication.AppleAuthenticationCredential;
		try {
			credential = await AppleAuthentication.signInAsync({
				requestedScopes: [
					AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
					AppleAuthentication.AppleAuthenticationScope.EMAIL,
				],
			});
		} catch (error) {
			// The user dismissing the sheet is not an error worth surfacing, and
			// must not silently fall through to the browser flow either.
			if ((error as { code?: string })?.code === "ERR_REQUEST_CANCELED") {
				throw new Error("Social login was cancelled");
			}
			return false;
		}

		if (!credential.identityToken) return false;

		// Apple sends the name only on the very first authorization; the backend
		// keeps whatever it already stored on later sign-ins.
		const fullName = [
			credential.fullName?.givenName,
			credential.fullName?.familyName,
		]
			.filter(Boolean)
			.join(" ")
			.trim();

		let data: LoginResponse;
		try {
			data = await api.post<LoginResponse>(
				"/api/public/auth/oauth/apple/native",
				{
					authorizationCode: credential.authorizationCode,
					fullName: fullName || undefined,
					identityToken: credential.identityToken,
				},
			);
		} catch (error) {
			if (error instanceof ApiError && error.status === 501) return false;
			throw error;
		}

		await SecureStore.setItemAsync("auth_token", data.token);
		setToken(data.token);
		setUser(data.user);
		return true;
	};

	const loginWithProvider = async (
		provider: SocialAuthProvider,
		redirectTo?: string,
	): Promise<void> => {
		if (provider === "apple" && (await loginWithAppleNative())) {
			return;
		}

		const callbackPath = redirectTo
			? `/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
			: "/auth/callback";
		const redirectUri = Linking.createURL(callbackPath);
		const startUrl = `${API_BASE_URL}/api/public/auth/oauth/${provider}/start?audience=mobile&mobileRedirectUri=${encodeURIComponent(redirectUri)}`;
		const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);

		if (result.type !== "success" || !result.url) {
			throw new Error("Social login was cancelled");
		}

		const parsed = Linking.parse(result.url);
		const oauthError =
			typeof parsed.queryParams?.oauthError === "string"
				? parsed.queryParams.oauthError
				: null;
		const transferToken =
			typeof parsed.queryParams?.transferToken === "string"
				? parsed.queryParams.transferToken
				: null;

		if (oauthError) {
			throw new Error(oauthError);
		}

		if (!transferToken) {
			throw new Error("Missing mobile OAuth transfer token");
		}

		const data = await api.post<LoginResponse>(
			"/api/public/auth/oauth/mobile/exchange",
			{ transferToken },
		);

		await SecureStore.setItemAsync("auth_token", data.token);
		setToken(data.token);
		setUser(data.user);
	};

	const register = async (
		name: string,
		email: string,
		password: string,
	): Promise<void> => {
		await api.post("/api/users", { name, email, password });
		// Auto-login after successful registration
		await login(email, password);
	};

	const logout = async (): Promise<void> => {
		try {
			await api.post("/api/users/logout", {});
		} catch {
			// Ignore logout endpoint errors; we still clear local state
		}
		await SecureStore.deleteItemAsync("auth_token");
		setToken(null);
		setUser(null);
	};

	const refreshUser = async (): Promise<void> => {
		try {
			const data = await api.get<MeResponse>("/api/users/me");
			setUser(data.user);
		} catch {
			// Silently fail — don't log out the user on a refresh error
		}
	};

	/** Optimistically update local user state (e.g. after profile edit) */
	const updateUser = (updates: Partial<UserDoc>): void => {
		setUser((prev) => (prev ? { ...prev, ...updates } : prev));
	};

	const value: AuthContextType = {
		user,
		token,
		isLoading,
		login,
		loginWithProvider,
		register,
		logout,
		refreshUser,
		updateUser,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error("useAuth must be used within an <AuthProvider>");
	}
	return ctx;
}
