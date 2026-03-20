import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { LoginResponse, MeResponse, UserDoc } from "@/src/types/api";
import { API_BASE_URL, api } from "./api";

WebBrowser.maybeCompleteAuthSession();

// Re-export for convenience so other files can import User from here
export type { UserDoc as User };
export type SocialAuthProvider = "apple" | "facebook" | "google";

interface AuthContextType {
	user: UserDoc | null;
	token: string | null;
	isLoading: boolean;
	login: (email: string, password: string) => Promise<void>;
	loginWithProvider: (provider: SocialAuthProvider) => Promise<void>;
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

	const loginWithProvider = async (
		provider: SocialAuthProvider,
	): Promise<void> => {
		const redirectUri = Linking.createURL("/auth/callback");
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
