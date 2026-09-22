import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { type ApiError, api } from "../lib/api";

export const contactPhoneKey = (listingId: string) =>
	["listings", listingId, "contact-phone"] as const;

export interface ContactPhone {
	phone: string;
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
		mutationFn: () =>
			api.post<ContactPhone>(
				`/api/listings/${encodeURIComponent(listingId)}/contact-phone`,
				{},
			),
		retry: false,
	});
}
