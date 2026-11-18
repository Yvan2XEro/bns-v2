"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import type {
	SavedAddress,
	SavedAddressListResponse,
	savedAddressBody,
} from "~/lib/saved-addresses";
import { apiDelete, apiGet, apiPatch, apiPost } from "~/lib/shop-api";

export const savedAddressesKey = () => ["me", "addresses"] as const;

type Body = ReturnType<typeof savedAddressBody>;

export function useSavedAddresses(enabled = true) {
	return useQuery<SavedAddressListResponse, ApiError>({
		queryKey: savedAddressesKey(),
		queryFn: () => apiGet("/api/me/addresses"),
		enabled,
		staleTime: 60_000,
	});
}

export function useSaveAddress() {
	const queryClient = useQueryClient();
	return useMutation<SavedAddress, ApiError, { id: string | null; body: Body }>(
		{
			mutationFn: ({ id, body }) =>
				id
					? apiPatch(`/api/me/addresses/${encodeURIComponent(id)}`, body)
					: apiPost("/api/me/addresses", body),
			onSuccess: () =>
				queryClient.invalidateQueries({ queryKey: savedAddressesKey() }),
		},
	);
}

export function useMakeDefaultAddress() {
	const queryClient = useQueryClient();
	return useMutation<SavedAddress, ApiError, string>({
		mutationFn: (id) =>
			apiPatch(`/api/me/addresses/${encodeURIComponent(id)}`, {
				isDefault: true,
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: savedAddressesKey() }),
	});
}

export function useDeleteAddress() {
	const queryClient = useQueryClient();
	return useMutation<{ ok: true }, ApiError, string>({
		mutationFn: (id) =>
			apiDelete(`/api/me/addresses/${encodeURIComponent(id)}`),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: savedAddressesKey() }),
	});
}
