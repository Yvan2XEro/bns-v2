"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { apiErrorFrom } from "~/lib/apiError";
import type { User } from "~/types";

export type SocialAuthProvider = "apple" | "facebook" | "google";

interface AuthContextType {
	user: User | null;
	token: string | null;
	isLoading: boolean;
	login: (email: string, password: string) => Promise<void>;
	loginWithProvider: (
		provider: SocialAuthProvider,
		redirectTo?: string,
	) => void;
	register: (email: string, password: string, name: string) => Promise<void>;
	logout: () => Promise<void>;
	refreshUser: () => Promise<void>;
	refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const fetchAuthenticatedUser = useCallback(async () => {
		const response = await fetch("/api/users/me", {
			cache: "no-store",
			credentials: "include",
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch current user (${response.status})`);
		}

		return response.json() as Promise<{ token?: string; user?: User }>;
	}, []);

	const checkAuth = useCallback(async () => {
		try {
			const data = await fetchAuthenticatedUser();
			if (data.user) {
				setUser(data.user);
				if (data.token) setToken(data.token);
			}
		} catch (error) {
			console.error("Auth check failed:", error);
		} finally {
			setIsLoading(false);
		}
	}, [fetchAuthenticatedUser]);

	useEffect(() => {
		checkAuth();
	}, [checkAuth]);

	async function login(email: string, password: string) {
		const response = await fetch("/api/users/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
			credentials: "include",
		});

		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw apiErrorFrom(response.status, body);
		}

		const data = await response.json();
		if (data.token) setToken(data.token);

		try {
			const hydrated = await fetchAuthenticatedUser();
			if (hydrated.user) {
				setUser(hydrated.user);
				if (hydrated.token) setToken(hydrated.token);
				return;
			}
		} catch (error) {
			console.error("Post-login user hydration failed:", error);
		}

		setUser(data.user);
	}

	async function register(email: string, password: string, name: string) {
		const response = await fetch("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password, name }),
			credentials: "include",
		});

		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw apiErrorFrom(response.status, body);
		}

		// After registration, log in to get the auth cookie
		await login(email, password);
	}

	function loginWithProvider(
		provider: SocialAuthProvider,
		redirectTo = "/",
	): void {
		const target = encodeURIComponent(redirectTo);
		const returnTo = encodeURIComponent(
			new URL(redirectTo, window.location.origin).toString(),
		);
		window.location.assign(
			`/api/public/auth/oauth/${provider}/start?audience=web&redirectTo=${target}&returnTo=${returnTo}`,
		);
	}

	async function logout() {
		try {
			await fetch("/api/users/logout", {
				method: "POST",
				credentials: "include",
			});
		} catch {
			// Clear user state even if API call fails
		}
		setUser(null);
		setToken(null);
	}

	const refreshUser = useCallback(async () => {
		try {
			const data = await fetchAuthenticatedUser();
			if (data.user) {
				setUser(data.user);
				if (data.token) setToken(data.token);
			}
		} catch (error) {
			console.error("Refresh user failed:", error);
		}
	}, [fetchAuthenticatedUser]);

	const refreshToken = useCallback(async () => {
		try {
			const response = await fetch("/api/users/refresh-token", {
				method: "POST",
				credentials: "include",
			});
			if (response.ok) {
				const data = await response.json();
				if (data.user) {
					setUser(data.user);
				}
				if (data.refreshedToken) setToken(data.refreshedToken);
			}
		} catch (error) {
			console.error("Token refresh failed:", error);
		}
	}, []);

	// Proactively refresh the Payload session when the tab regains focus or
	// becomes visible, keeping the rolling session alive as long as the user
	// keeps the app in use.
	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState === "visible") {
				refreshToken();
			}
		};
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onVisible);
		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", onVisible);
		};
	}, [refreshToken]);

	return (
		<AuthContext.Provider
			value={{
				user,
				token,
				isLoading,
				login,
				loginWithProvider,
				register,
				logout,
				refreshUser,
				refreshToken,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
