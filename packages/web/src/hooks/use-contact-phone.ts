"use client";

import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import {
	ApiError,
	apiErrorFrom,
	ERROR_CODES,
	fallbackFor,
} from "~/lib/apiError";

export const contactPhoneKey = (listingId: string) =>
	["listings", listingId, "contact-phone"] as const;

export interface ContactPhone {
	phone: string;
}

async function revealContactPhone(listingId: string): Promise<ContactPhone> {
	let response: Response;
	try {
		response = await fetch(
			`/api/listings/${encodeURIComponent(listingId)}/contact-phone`,
			{ method: "POST", credentials: "include" },
		);
	} catch {
		throw new ApiError(
			fallbackFor(ERROR_CODES.network),
			0,
			ERROR_CODES.network,
		);
	}

	const body: unknown = await response.json().catch(() => ({}));
	if (!response.ok) throw apiErrorFrom(response.status, body);

	const phone = (body as { phone?: unknown }).phone;
	if (typeof phone !== "string" || !phone) {
		throw new ApiError(
			fallbackFor(ERROR_CODES.contactPhoneUnavailable),
			response.status,
			ERROR_CODES.contactPhoneUnavailable,
		);
	}
	return { phone };
}

/**
 * Reveals a seller's phone number. A mutation rather than a query: the API
 * records the reveal and counts the call against a rate limit, so it must run
 * only on an explicit tap and never be replayed by a refetch.
 */
export function useRevealContactPhone(
	listingId: string,
): UseMutationResult<ContactPhone, ApiError, void> {
	return useMutation<ContactPhone, ApiError, void>({
		mutationKey: contactPhoneKey(listingId),
		mutationFn: () => revealContactPhone(listingId),
		retry: false,
	});
}
