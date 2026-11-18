import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shopApi } from "../lib/api";
import { shopKeys } from "./useShops";

/** GET /api/public/invitations/:token — unauthenticated, so no `enabled: Boolean(user)` gate. */
export function useInvitation(token: string | undefined) {
	return useQuery({
		queryKey: shopKeys.invitation(token ?? ""),
		queryFn: () => shopApi.lookupInvitation(token ?? ""),
		enabled: Boolean(token),
		retry: false,
	});
}

export function useAcceptInvitation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (token: string) => shopApi.acceptInvitation(token),
		// Accepting adds a shop to the caller's membership list.
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: shopKeys.myShops });
		},
	});
}

export function useDeclineInvitation() {
	return useMutation({
		mutationFn: (token: string) => shopApi.declineInvitation(token),
	});
}
