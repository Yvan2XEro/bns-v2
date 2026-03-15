import * as SecureStore from "expo-secure-store";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { LoginResponse, MeResponse, UserDoc } from "@/src/types/api";
import { api } from "./api";

// Re-export for convenience so other files can import User from here
export type { UserDoc as User };

interface AuthContextType {
	user: UserDoc | null;
	token: string | null;
	isLoading: boolean;
	login: (email: string, password: string) => Promise<void>;
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
