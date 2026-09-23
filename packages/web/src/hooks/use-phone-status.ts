"use client";

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import {
	ApiError,
	apiErrorFrom,
	ERROR_CODES,
	fallbackFor,
} from "~/lib/apiError";

export const phoneStatusKey = ["account", "phone", "status"] as const;

export interface PhoneStatus {
	isPhoneVerified: boolean;
	phone: string | null;
}

async function fetchPhoneStatus(): Promise<PhoneStatus> {
	let response: Response;
	try {
		response = await fetch("/api/account/phone/status", {
			credentials: "include",
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

	const data = body as { isPhoneVerified?: unknown; phone?: unknown };
	return {
		isPhoneVerified: data.isPhoneVerified === true,
		phone: typeof data.phone === "string" ? data.phone : null,
	};
}

/**
 * Whether the signed-in account has a verified phone. Fails closed: a failed
 * read reads as "not verified", which shows the gate instead of a form that
 * the server would refuse.
 */
export function usePhoneStatus(): UseQueryResult<PhoneStatus, ApiError> {
	return useQuery<PhoneStatus, ApiError>({
		queryKey: phoneStatusKey,
		queryFn: fetchPhoneStatus,
		retry: false,
	});
}
