import { fetch as expoFetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";

export const API_BASE_URL =
	process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const REQUEST_TIMEOUT_MS = 15000;

async function getToken(): Promise<string | null> {
	return SecureStore.getItemAsync("auth_token");
}

async function setToken(token: string): Promise<void> {
	await SecureStore.setItemAsync("auth_token", token);
}

async function removeToken(): Promise<void> {
	await SecureStore.deleteItemAsync("auth_token");
}

/**
 * Read the `exp` claim from a JWT without verifying it. Used only to decide
 * whether a proactive refresh is worth attempting — the native /refresh-token
 * endpoint requires the existing token to still be within its validity window.
 */
export function decodeJwtExp(token: string): number | null {
	const parts = token.split(".");
	if (parts.length < 2) return null;
	try {
		const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const bin = atob(b64);
		const json = decodeURIComponent(
			bin
				.split("")
				.map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
				.join(""),
		);
		const payload = JSON.parse(json) as { exp?: number };
		return typeof payload.exp === "number" ? payload.exp : null;
	} catch {
		return null;
	}
}

let refreshing: Promise<boolean> | null = null;
let unauthorizedHandler: (() => void) | null = null;

/** Register a callback fired when a request fails and cannot be recovered by refresh. */
export function setUnauthorizedHandler(handler: () => void): void {
	unauthorizedHandler = handler;
}

/**
 * Attempt a native Payload token refresh. Returns true when a new token was
 * stored. Guarded so concurrent requests share a single in-flight refresh.
 * No-op (false) when there is no token or it has already expired.
 */
export function refreshToken(): Promise<boolean> {
	if (refreshing) return refreshing;
	refreshing = (async () => {
		const token = await getToken();
		if (!token) return false;
		const exp = decodeJwtExp(token);
		if (exp && exp * 1000 <= Date.now()) return false;
		try {
			const res = await fetch(`${API_BASE_URL}/api/users/refresh-token`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `JWT ${token}`,
				},
			});
			if (!res.ok) return false;
			const data = (await res.json()) as { refreshedToken?: string };
			if (data.refreshedToken) {
				await setToken(data.refreshedToken);
				return true;
			}
			return false;
		} catch {
			return false;
		} finally {
			refreshing = null;
		}
	})();
	return refreshing;
}

export class ApiError extends Error {
	status: number;
	data: unknown;

	constructor(message: string, status: number, data: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.data = data;
	}
}

async function request<T>(
	path: string,
	options: RequestInit = {},
	retried = false,
): Promise<T> {
	const token = await getToken();

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options.headers as Record<string, string>),
	};

	if (token) {
		headers.Authorization = `JWT ${token}`;
	}

	// Without a timeout a stalled-but-open socket (captive portal, corporate
	// wifi) leaves the auth bootstrap pending forever and the app sits on a
	// full-screen loader indefinitely.
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	let res: Response;
	try {
		res = await fetch(`${API_BASE_URL}${path}`, {
			...options,
			headers,
			signal: controller.signal,
		});
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new ApiError(
				"La requête a expiré. Vérifiez votre connexion.",
				408,
				{
					path,
				},
			);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}

	if (!res.ok) {
		if (res.status === 401 && !retried) {
			// Try to recover a still-valid session with a single refresh, then
			// retry the original request once with the new token.
			const recovered = await refreshToken();
			if (recovered) {
				return request<T>(path, options, true);
			}
			await removeToken();
			unauthorizedHandler?.();
		}

		const error = (await res.json().catch(() => ({}))) as {
			error?: string;
			message?: string;
		};

		// Surface a typed error so callers can inspect `status`
		throw new ApiError(
			error.message ??
				error.error ??
				`Request failed with status ${res.status}`,
			res.status,
			error,
		);
	}

	// 204 No Content — return empty object cast to T
	if (res.status === 204) {
		return {} as T;
	}

	return res.json() as Promise<T>;
}

export const api = {
	get: <T>(path: string): Promise<T> => request<T>(path),

	post: <T>(path: string, body: unknown): Promise<T> =>
		request<T>(path, {
			method: "POST",
			body: JSON.stringify(body),
		}),

	patch: <T>(path: string, body: unknown): Promise<T> =>
		request<T>(path, {
			method: "PATCH",
			body: JSON.stringify(body),
		}),

	put: <T>(path: string, body: unknown): Promise<T> =>
		request<T>(path, {
			method: "PUT",
			body: JSON.stringify(body),
		}),

	delete: <T>(path: string): Promise<T> =>
		request<T>(path, { method: "DELETE" }),

	upload: async <T>(path: string, formData: FormData): Promise<T> => {
		const token = await getToken();
		const headers: Record<string, string> = {};

		if (token) {
			headers.Authorization = `JWT ${token}`;
		}

		// Do NOT set Content-Type here — the browser/RN sets it with the correct
		// multipart boundary automatically when body is FormData.
		const res = await expoFetch(`${API_BASE_URL}${path}`, {
			method: "POST",
			body: formData,
			headers,
		});

		if (!res.ok) {
			const error = (await res.json().catch(() => ({}))) as {
				error?: string;
				message?: string;
				errors?: { message: string }[];
			};
			const msg =
				error.message ??
				error.error ??
				error.errors?.[0]?.message ??
				`Upload failed (${res.status})`;
			throw new ApiError(msg, res.status, error);
		}

		return res.json() as Promise<T>;
	},
};

// Re-export token helpers so AuthProvider can share the same storage key.
export { getToken, setToken, removeToken };
