"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import type { User } from "~/types";

interface AuthContextType {
	user: User | null;
	token: string | null;
	isLoading: boolean;
	login: (email: string, password: string) => Promise<void>;
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

	const checkAuth = useCallback(async () => {
		try {
			const response = await fetch("/api/users/me", {
				credentials: "include",
			});
			if (response.ok) {
				const data = await response.json();
				if (data.user) {
					setUser(data.user);
					if (data.token) setToken(data.token);
				}
			}
		} catch (error) {
			console.error("Auth check failed:", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

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
			const error = await response.json().catch(() => ({}));
			throw new Error(
				error.errors?.[0]?.message || error.message || "Login failed",
			);
		}

		const data = await response.json();
		setUser(data.user);
		if (data.token) setToken(data.token);
	}

	async function register(email: string, password: string, name: string) {
		const response = await fetch("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password, name }),
			credentials: "include",
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(
				error.errors?.[0]?.message || error.message || "Registration failed",
			);
		}

		// After registration, log in to get the auth cookie
		await login(email, password);
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
			const response = await fetch("/api/users/me", {
				credentials: "include",
			});
			if (response.ok) {
				const data = await response.json();
				if (data.user) {
					setUser(data.user);
					if (data.token) setToken(data.token);
				}
			}
		} catch (error) {
			console.error("Refresh user failed:", error);
		}
	}, []);

	async function refreshToken() {
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
	}

	return (
		<AuthContext.Provider
			value={{
				user,
				token,
				isLoading,
				login,
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
