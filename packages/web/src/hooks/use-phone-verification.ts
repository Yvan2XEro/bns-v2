"use client";

import {
	type UseMutationResult,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type PhoneStatus,
	parsePhoneStatus,
	phoneStatusKey,
} from "~/hooks/use-phone-status";
import {
	ApiError,
	apiErrorFrom,
	ERROR_CODES,
	fallbackFor,
} from "~/lib/apiError";

export const startPhoneVerificationKey = ["account", "phone", "start"] as const;
export const verifyPhoneVerificationKey = [
	"account",
	"phone",
	"verify",
] as const;

async function postPhoneAction(
	endpoint: string,
	data: unknown,
): Promise<PhoneStatus> {
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
	} catch {
		throw new ApiError(
			fallbackFor(ERROR_CODES.network),
			0,
			ERROR_CODES.network,
		);
	}

	const body: unknown = await response.json().catch(() => ({}));
	if (!response.ok) throw apiErrorFrom(response.status, body);

	return parsePhoneStatus(body);
}

/**
 * Sends (or resends) a code to a phone number pending verification.
 * `retry: false` matters here as much as the caller disabling its button:
 * a network hiccup must never cause a second SMS to go out on its own.
 */
export function useStartPhoneVerification(): UseMutationResult<
	PhoneStatus,
	ApiError,
	string
> {
	const queryClient = useQueryClient();

	return useMutation<PhoneStatus, ApiError, string>({
		mutationKey: startPhoneVerificationKey,
		mutationFn: (phone) =>
			postPhoneAction("/api/account/phone/start", { phone }),
		retry: false,
		onSuccess: (status) => {
			queryClient.setQueryData(phoneStatusKey, status);
			void queryClient.invalidateQueries({ queryKey: phoneStatusKey });
		},
	});
}

/**
 * Confirms the pending phone with its 6-digit code.
 *
 * The status is refetched on failure too, not only on success: an expired or
 * too-many-attempts refusal clears server-side state (the pending code, or
 * the whole pending phone), and the form needs that reflected to fall back to
 * a state the seller can act on instead of resubmitting into a dead code.
 */
export function useVerifyPhoneVerificationCode(): UseMutationResult<
	PhoneStatus,
	ApiError,
	string
> {
	const queryClient = useQueryClient();

	return useMutation<PhoneStatus, ApiError, string>({
		mutationKey: verifyPhoneVerificationKey,
		mutationFn: (code) =>
			postPhoneAction("/api/account/phone/verify", { code }),
		retry: false,
		onSuccess: (status) => {
			queryClient.setQueryData(phoneStatusKey, status);
			void queryClient.invalidateQueries({ queryKey: phoneStatusKey });
		},
		onError: () => {
			void queryClient.invalidateQueries({ queryKey: phoneStatusKey });
		},
	});
}
