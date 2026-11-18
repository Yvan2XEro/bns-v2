"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { myShopsKey, teamKey } from "~/lib/query-keys";
import { shopApi } from "~/lib/shop-api";
import type { InboxNotificationPreference, TeamView } from "~/types";

export { teamKey };

/** The team view: active members, masked pending invitations, and the seat limit. */
export function useShopTeam(shopId: string | null) {
	return useQuery<TeamView, ApiError>({
		queryKey: teamKey(shopId ?? ""),
		queryFn: () => shopApi.listTeam(shopId ?? ""),
		enabled: Boolean(shopId),
		retry: false,
	});
}

function useTeamMutation<TVars, TData>(
	shopId: string,
	mutationFn: (vars: TVars) => Promise<TData>,
	options: { alsoMyShops?: boolean } = {},
) {
	const queryClient = useQueryClient();
	return useMutation<TData, ApiError, TVars>({
		mutationFn,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: teamKey(shopId) });
			if (options.alsoMyShops) {
				void queryClient.invalidateQueries({ queryKey: myShopsKey() });
			}
		},
	});
}

export const useInviteMember = (shopId: string) =>
	useTeamMutation(shopId, (vars: Parameters<typeof shopApi.invite>[1]) =>
		shopApi.invite(shopId, vars),
	);

export const useResendInvitation = (shopId: string) =>
	useTeamMutation(shopId, (invitationId: string) =>
		shopApi.resendInvitation(shopId, invitationId),
	);

export const useRevokeInvitation = (shopId: string) =>
	useTeamMutation(shopId, (invitationId: string) =>
		shopApi.revokeInvitation(shopId, invitationId),
	);

export const useChangeMemberRole = (shopId: string) =>
	useTeamMutation(
		shopId,
		(vars: { memberId: string; role: "manager" | "staff" }) =>
			shopApi.changeMemberRole(shopId, vars.memberId, vars.role),
		{ alsoMyShops: true },
	);

export const useRemoveMember = (shopId: string) =>
	useTeamMutation(
		shopId,
		(memberId: string) => shopApi.removeMember(shopId, memberId),
		{ alsoMyShops: true },
	);

export const useLeaveShop = (shopId: string) =>
	useTeamMutation(shopId, () => shopApi.leaveShop(shopId), {
		alsoMyShops: true,
	});

export const useInboxPreference = (shopId: string) =>
	useTeamMutation(shopId, (preference: InboxNotificationPreference) =>
		shopApi.updateInboxPreference(shopId, preference),
	);
