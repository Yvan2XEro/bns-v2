"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { type ApiError, apiErrorFrom } from "~/lib/apiError";

async function post(path: string, body?: unknown): Promise<Response> {
	const response = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
		credentials: "include",
	});
	if (!response.ok) {
		const data = await response.json().catch(() => ({}));
		throw apiErrorFrom(response.status, data);
	}
	return response;
}

/**
 * Sends the verification email again. The API answers the same whether or
 * not the address has an account, so success only means "sent if there was
 * something to send".
 */
export function useResendVerification() {
	return useMutation<void, ApiError, string>({
		mutationFn: async (email) => {
			await post("/api/account/email/resend", { email });
		},
	});
}

export const verifyEmailKey = (token: string) =>
	["auth", "verify-email", token] as const;

/** Confirms the link from the email, once per token (Payload's own route). */
export function useVerifyEmail(token: string | null) {
	return useQuery<boolean, ApiError>({
		queryKey: verifyEmailKey(token ?? ""),
		queryFn: async () => {
			await post(`/api/users/verify/${encodeURIComponent(token ?? "")}`);
			return true;
		},
		enabled: Boolean(token),
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
	});
}
