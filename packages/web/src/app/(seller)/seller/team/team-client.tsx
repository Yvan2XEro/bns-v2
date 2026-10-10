"use client";

import { useTranslations } from "next-intl";
import { useReducer, useState } from "react";
import { InviteDialog } from "~/components/seller/team/invite-dialog";
import { MemberActionDialogs } from "~/components/seller/team/member-action-dialogs";
import { MemberTable } from "~/components/seller/team/member-table";
import { PendingInvitations } from "~/components/seller/team/pending-invitations";
import { TeamLimitMeter } from "~/components/seller/team/team-limit-meter";
import { TeamLocked } from "~/components/seller/team/team-locked";
import { Button } from "~/components/ui/button";
import {
	useChangeMemberRole,
	useRemoveMember,
	useResendInvitation,
	useRevokeInvitation,
	useShopTeam,
} from "~/hooks/use-shop-team";
import { resolveErrorMessage } from "~/lib/apiError";
import { assignableRoles, seatSummary } from "~/lib/team-form";
import type { PendingInvitationView, ShopRole, TeamMemberView } from "~/types";

type State = {
	inviteOpen: boolean;
	confirmRemove: TeamMemberView | null;
	roleTarget: TeamMemberView | null;
};

const initialState: State = {
	inviteOpen: false,
	confirmRemove: null,
	roleTarget: null,
};

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

function TeamSkeleton() {
	return (
		<div className="space-y-3">
			{[0, 1, 2].map((row) => (
				<div
					key={row}
					className="h-16 animate-pulse rounded-2xl bg-[#F1F5F9]"
				/>
			))}
		</div>
	);
}

/**
 * Orchestrates the five pieces of `/seller/team`: the state they share
 * (which dialog is open, which member it targets) lives here in one
 * `useReducer`, so a component below never has to guess whether a sibling
 * dialog is already open for a different member.
 */
export function TeamClient({
	shopId,
	role,
}: {
	shopId: string;
	role: ShopRole | null;
}) {
	const t = useTranslations("Team");
	const tRoot = useTranslations();
	const team = useShopTeam(shopId);
	const [state, patch] = useReducer(reducer, initialState);
	const [resendingId, setResendingId] = useState<string | null>(null);
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	const removeMember = useRemoveMember(shopId);
	const changeRole = useChangeMemberRole(shopId);
	const resendInvitation = useResendInvitation(shopId);
	const revokeInvitation = useRevokeInvitation(shopId);

	if (team.isPending) return <TeamSkeleton />;

	if (team.isError) {
		return (
			<div
				role="alert"
				className="rounded-2xl border border-[#E2E8F0] bg-white px-6 py-12 text-center"
			>
				<p className="font-semibold text-[#0F172A]">
					{resolveErrorMessage(team.error, tRoot)}
				</p>
				<Button className="mt-4" onClick={() => void team.refetch()}>
					{tRoot("Verification.error.retry")}
				</Button>
			</div>
		);
	}

	const view = team.data;
	if (!view.teamMembers) return <TeamLocked />;

	const seats = seatSummary(view);
	const canInvite = assignableRoles(role).length > 0;
	const isFull = seats.used >= seats.total;

	async function runAction(action: () => Promise<unknown>) {
		setActionError(null);
		try {
			await action();
		} catch (error) {
			setActionError(resolveErrorMessage(error, tRoot));
		}
	}

	const handleResend = (invitation: PendingInvitationView) =>
		runAction(async () => {
			setResendingId(invitation.id);
			try {
				await resendInvitation.mutateAsync(invitation.id);
			} finally {
				setResendingId(null);
			}
		});

	const handleRevoke = (invitation: PendingInvitationView) =>
		runAction(async () => {
			setRevokingId(invitation.id);
			try {
				await revokeInvitation.mutateAsync(invitation.id);
			} finally {
				setRevokingId(null);
			}
		});

	const confirmRemoveMember = () =>
		runAction(async () => {
			if (!state.confirmRemove) return;
			await removeMember.mutateAsync(state.confirmRemove.id);
			patch({ confirmRemove: null });
		});

	const applyRoleChange = (next: "manager" | "staff") =>
		runAction(async () => {
			if (!state.roleTarget) return;
			await changeRole.mutateAsync({
				memberId: state.roleTarget.id,
				role: next,
			});
			patch({ roleTarget: null });
		});

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
				{canInvite && (
					<div className="text-right">
						<Button
							onClick={() => patch({ inviteOpen: true })}
							disabled={isFull}
						>
							{t("invite")}
						</Button>
						{isFull && (
							<p className="mt-1 max-w-xs text-[#92400E] text-xs">
								{t("inviteFull")}
							</p>
						)}
					</div>
				)}
			</div>

			{actionError && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{actionError}
				</p>
			)}

			<TeamLimitMeter team={view} />

			<MemberTable
				members={view.members}
				role={role}
				onChangeRole={(member) => patch({ roleTarget: member })}
				onRemove={(member) => patch({ confirmRemove: member })}
			/>

			<PendingInvitations
				invitations={view.invitations}
				role={role}
				onResend={handleResend}
				onRevoke={handleRevoke}
				resendingId={resendingId}
				revokingId={revokingId}
			/>

			<InviteDialog
				shopId={shopId}
				role={role}
				open={state.inviteOpen}
				onClose={() => patch({ inviteOpen: false })}
			/>

			<MemberActionDialogs
				confirmRemove={state.confirmRemove}
				roleTarget={state.roleTarget}
				removePending={removeMember.isPending}
				onCloseRemove={() => patch({ confirmRemove: null })}
				onConfirmRemove={() => void confirmRemoveMember()}
				onCloseRole={() => patch({ roleTarget: null })}
				onApplyRoleChange={(next) => void applyRoleChange(next)}
			/>
		</div>
	);
}
