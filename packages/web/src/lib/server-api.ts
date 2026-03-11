"use server";

import { cookies } from "next/headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function serverFetch(
	endpoint: string,
	options?: RequestInit,
): Promise<Response> {
	const cookieStore = await cookies();
	const token = cookieStore.get("payload-token");

	return fetch(`${API_URL}${endpoint}`, {
		...options,
		headers: {
			"Content-Type": "application/json",
			...(token ? { Cookie: `payload-token=${token.value}` } : {}),
			...options?.headers,
		},
		cache: "no-store",
	});
}

export async function getAuthUser() {
	const res = await serverFetch("/api/users/me");
	if (!res.ok) return null;
	const data = await res.json();
	return data.user ?? null;
}

export async function serverGet<T>(endpoint: string): Promise<T | null> {
	try {
		const res = await serverFetch(endpoint);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}
