import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
	SavedAddress,
	SavedAddressListResponse,
	savedAddressBody,
} from "../lib/savedAddresses";

export const savedAddressesKey = ["me", "addresses"] as const;

type Body = ReturnType<typeof savedAddressBody>;

export function useSavedAddresses(enabled = true) {
	return useQuery({
		queryKey: savedAddressesKey,
		queryFn: () => api.get<SavedAddressListResponse>("/api/me/addresses"),
		enabled,
		staleTime: 60_000,
	});
}

export function useSaveAddress() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, body }: { id: string | null; body: Body }) =>
			id
				? api.patch<SavedAddress>(
						`/api/me/addresses/${encodeURIComponent(id)}`,
						body,
					)
				: api.post<SavedAddress>("/api/me/addresses", body),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: savedAddressesKey }),
	});
}

export function useMakeDefaultAddress() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			api.patch<SavedAddress>(`/api/me/addresses/${encodeURIComponent(id)}`, {
				isDefault: true,
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: savedAddressesKey }),
	});
}

export function useDeleteAddress() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			api.delete(`/api/me/addresses/${encodeURIComponent(id)}`),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: savedAddressesKey }),
	});
}
