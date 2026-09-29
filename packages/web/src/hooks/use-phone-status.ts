"use client";

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import {
	ApiError,
	apiErrorFrom,
	ERROR_CODES,
	fallbackFor,
} from "~/lib/apiError";

export const phoneStatusKey = ["account", "phone", "status"] as const;

/** Mirrors `GET /api/account/phone/status`'s response shape exactly. */
export interface PhoneStatus {
	isPhoneVerified: boolean;
	phone: string | null;
	pendingPhone: string | null;
	hasPendingVerification: boolean;
	resendAvailableAt: string | null;
	expiresAt: string | null;
	phoneVerifiedAt: string | null;
}

function str(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

/**
 * Shared by the status query and both start/verify mutations, whose
 * responses are `{ message, ...status }` — the same shape as this endpoint.
 */
export function parsePhoneStatus(body: unknown): PhoneStatus {
	const data = (body ?? {}) as Record<string, unknown>;
	return {
		isPhoneVerified: data.isPhoneVerified === true,
		phone: str(data.phone),
		pendingPhone: str(data.pendingPhone),
		hasPendingVerification: data.hasPendingVerification === true,
		resendAvailableAt: str(data.resendAvailableAt),
		expiresAt: str(data.expiresAt),
		phoneVerifiedAt: str(data.phoneVerifiedAt),
	};
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

	return parsePhoneStatus(body);
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
