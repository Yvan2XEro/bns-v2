import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shopApi } from "../lib/api";
import type { InboxNotificationPreference } from "../types/api";
import { shopKeys } from "./useShops";

export function useShopTeam(shopId: string | undefined) {
	return useQuery({
		queryKey: shopKeys.team(shopId ?? ""),
		queryFn: () => shopApi.listTeam(shopId ?? ""),
		enabled: Boolean(shopId),
	});
}

function useInvalidateTeam(shopId: string) {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: shopKeys.team(shopId) });
	};
}

/** A member leaving or being removed changes which shops `GET /api/me/shops` lists for them. */
function useInvalidateMembership(shopId: string) {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: shopKeys.team(shopId) });
		queryClient.invalidateQueries({ queryKey: shopKeys.myShops });
	};
}

export function useInviteMember(shopId: string) {
	const invalidate = useInvalidateTeam(shopId);
	return useMutation({
		mutationFn: (input: {
			channel: "phone" | "email";
			phone?: string;
			email?: string;
			role: "manager" | "staff";
		}) => shopApi.invite(shopId, input),
		onSuccess: invalidate,
	});
}

export function useResendInvitation(shopId: string) {
	const invalidate = useInvalidateTeam(shopId);
	return useMutation({
		mutationFn: (invitationId: string) =>
			shopApi.resendInvitation(shopId, invitationId),
		onSuccess: invalidate,
	});
}

export function useRevokeInvitation(shopId: string) {
	const invalidate = useInvalidateTeam(shopId);
	return useMutation({
		mutationFn: (invitationId: string) =>
			shopApi.revokeInvitation(shopId, invitationId),
		onSuccess: invalidate,
	});
}

export function useChangeMemberRole(shopId: string) {
	const invalidate = useInvalidateTeam(shopId);
	return useMutation({
		mutationFn: ({
			memberId,
			role,
		}: {
			memberId: string;
			role: "manager" | "staff";
		}) => shopApi.changeMemberRole(shopId, memberId, role),
		onSuccess: invalidate,
	});
}

export function useRemoveMember(shopId: string) {
	const invalidate = useInvalidateMembership(shopId);
	return useMutation({
		mutationFn: (memberId: string) => shopApi.removeMember(shopId, memberId),
		onSuccess: invalidate,
	});
}

export function useLeaveShop(shopId: string) {
	const invalidate = useInvalidateMembership(shopId);
	return useMutation({
		mutationFn: () => shopApi.leaveShop(shopId),
		onSuccess: invalidate,
	});
}

export function useInboxPreference(shopId: string) {
	const invalidate = useInvalidateTeam(shopId);
	return useMutation({
		mutationFn: (input: { inboxNotifications: InboxNotificationPreference }) =>
			shopApi.updateInboxPreference(shopId, input),
		onSuccess: invalidate,
	});
}
