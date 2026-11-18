"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { invitationKey, myShopsKey } from "~/lib/query-keys";
import { shopApi } from "~/lib/shop-api";
import type { PublicInvitationView, ShopRole } from "~/types";

export { invitationKey };

/** The public, pre-membership view of one invitation by its token. */
export function useInvitation(token: string | null) {
	return useQuery<PublicInvitationView, ApiError>({
		queryKey: invitationKey(token ?? ""),
		queryFn: () => shopApi.lookupInvitation(token ?? ""),
		enabled: Boolean(token),
		retry: false,
	});
}

export function useAcceptInvitation(token: string) {
	const queryClient = useQueryClient();
	return useMutation<{ shopId: string; role: ShopRole }, ApiError, void>({
		mutationFn: () => shopApi.acceptInvitation(token),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: invitationKey(token) });
			void queryClient.invalidateQueries({ queryKey: myShopsKey() });
		},
	});
}

export function useDeclineInvitation(token: string) {
	const queryClient = useQueryClient();
	return useMutation<{ declined: true }, ApiError, void>({
		mutationFn: () => shopApi.declineInvitation(token),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: invitationKey(token) });
			void queryClient.invalidateQueries({ queryKey: myShopsKey() });
		},
	});
}
