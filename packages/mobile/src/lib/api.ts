import * as SecureStore from "expo-secure-store";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

async function getToken(): Promise<string | null> {
	return SecureStore.getItemAsync("auth_token");
}

async function setToken(token: string): Promise<void> {
	await SecureStore.setItemAsync("auth_token", token);
}

async function removeToken(): Promise<void> {
	await SecureStore.deleteItemAsync("auth_token");
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const token = await getToken();

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options.headers as Record<string, string>),
	};

	if (token) {
		headers.Authorization = `JWT ${token}`;
	}

	const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

	if (!res.ok) {
		const error = (await res.json().catch(() => ({}))) as { message?: string };

		// Surface a typed error so callers can inspect `status`
		throw new ApiError(
			error.message ?? `Request failed with status ${res.status}`,
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
		const res = await fetch(`${BASE_URL}${path}`, {
			method: "POST",
			body: formData,
			headers,
		});

		if (!res.ok) {
			const error = (await res.json().catch(() => ({}))) as {
				message?: string;
			};
			throw new ApiError(error.message ?? "Upload failed", res.status, error);
		}

		return res.json() as Promise<T>;
	},
};

// Re-export token helpers so AuthProvider can share the same storage key.
export { getToken, setToken, removeToken };
