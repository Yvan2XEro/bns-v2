"use client";

import { MoreVertical } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { activityLabelKey } from "~/lib/shop-activity";
import { assignableRoles, memberActions, seatSummary } from "~/lib/team-form";
import { daysUntil } from "~/lib/team-roster";
import { timeAgo } from "~/lib/time-ago";
import type {
	PendingInvitationView,
	ShopRole,
	TeamMemberView,
	TeamView,
} from "~/types";

const ROLE_BADGE: Record<ShopRole, "default" | "secondary" | "outline"> = {
	owner: "default",
	manager: "secondary",
	staff: "outline",
};

const ROLE_LABEL_KEY: Record<
	ShopRole,
	"roleOwner" | "roleManager" | "roleStaff"
> = {
	owner: "roleOwner",
	manager: "roleManager",
	staff: "roleStaff",
};

/** A pending invitation resends at most this many times (server-enforced). */
const RESEND_LIMIT = 3;

const ACTION_BUTTON =
	"rounded-lg p-1.5 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-[var(--shop-accent,var(--c-brand))]";

function initials(name: string | null): string {
	const parts = (name ?? "?").trim().split(/\s+/).filter(Boolean);
	return (
		parts
			.slice(0, 2)
			.map((part) => part.slice(0, 1).toUpperCase())
			.join("") || "?"
	);
}

/**
 * Members and pending invitations in one roster, with the seat count in the
 * card header. "Last activity" is the member's latest entry in the shop's
 * activity log — there is no presence tracking, so nobody reads as online —
 * and the column only exists for a caller who may read that log.
 */
export function MemberTable({
	team,
	role,
	onChangeRole,
	onRemove,
	onResend,
	onRevoke,
	resendingId,
	revokingId,
}: {
	team: TeamView;
	role: ShopRole | null;
	onChangeRole: (member: TeamMemberView) => void;
	onRemove: (member: TeamMemberView) => void;
	onResend: (invitation: PendingInvitationView) => void;
	onRevoke: (invitation: PendingInvitationView) => void;
	resendingId: string | null;
	revokingId: string | null;
}) {
	const tTeam = useTranslations("Team");
	const tPage = useTranslations("TeamPage");
	const tRoot = useTranslations();
	const locale = useLocale();
	const { used, total, overage } = seatSummary(team);
	const showActivity = team.members.some(
		(member) => member.lastActivity !== undefined,
	);
	const columns = showActivity ? 5 : 4;

	return (
		<section
			aria-labelledby="team-members-title"
			className="overflow-hidden rounded-2xl border border-line bg-surface"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2 border-subtle border-b px-[18px] py-3.5">
				<h2 id="team-members-title" className="font-bold text-base text-ink">
					{tTeam("members")}
				</h2>
				<p className="text-[13px] text-ink-muted">
					{tPage("seats", { used, total })}
					{overage > 0 && (
						<span className="ml-2 text-warn-ink-soft">
							{tTeam("overage", { count: overage })}
						</span>
					)}
				</p>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[560px] text-sm">
					<thead className="bg-canvas text-left text-ink-muted text-xs">
						<tr>
							<th className="px-[18px] py-2.5 font-medium">
								{tPage("colMember")}
							</th>
							<th className="px-3 py-2.5 font-medium">{tTeam("roleLabel")}</th>
							{showActivity && (
								<th className="px-3 py-2.5 font-medium">
									{tPage("colLastActivity")}
								</th>
							)}
							<th className="px-3 py-2.5 font-medium">{tPage("colStatus")}</th>
							<th className="px-[18px] py-2.5">
								<span className="sr-only">{tPage("colActions")}</span>
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-subtle">
						{team.members.map((member) => {
							const actions = memberActions(role, member);
							const joined = member.joinedAt
								? new Date(member.joinedAt).toLocaleDateString(locale, {
										day: "numeric",
										month: "short",
										year: "numeric",
									})
								: null;
							return (
								<tr key={member.id}>
									<td className="px-[18px] py-3">
										<div className="flex items-center gap-3">
											<Avatar className="h-[38px] w-[38px]">
												<AvatarImage
													src={member.avatarUrl ?? undefined}
													alt=""
												/>
												<AvatarFallback>{initials(member.name)}</AvatarFallback>
											</Avatar>
											<div className="min-w-0">
												<p className="font-semibold text-ink">
													{member.name ?? "—"}
												</p>
												{joined && (
													<p className="text-ink-muted text-xs">
														{tPage("since", { date: joined })}
													</p>
												)}
											</div>
										</div>
									</td>
									<td className="px-3 py-3">
										<Badge
											variant={ROLE_BADGE[member.role]}
											title={tTeam(`${ROLE_LABEL_KEY[member.role]}Description`)}
										>
											{tTeam(ROLE_LABEL_KEY[member.role])}
										</Badge>
									</td>
									{showActivity && (
										<td className="px-3 py-3">
											{member.lastActivity ? (
												<>
													<p className="text-ink">
														{timeAgo(member.lastActivity.at, locale, {
															maxDays: 30,
														})}
													</p>
													<p className="text-ink-muted text-xs">
														{tRoot(
															activityLabelKey(member.lastActivity.action),
														)}
													</p>
												</>
											) : (
												<span className="text-ink-faint">—</span>
											)}
										</td>
									)}
									<td className="px-3 py-3">
										{member.suspended ? (
											<Badge variant="destructive">{tTeam("suspended")}</Badge>
										) : (
											<Badge variant="success">{tPage("statusActive")}</Badge>
										)}
									</td>
									<td className="px-[18px] py-3 text-right">
										{(actions.canChangeRole || actions.canRemove) && (
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														aria-label={tPage("memberActions", {
															name: member.name ?? "—",
														})}
														className={ACTION_BUTTON}
													>
														<MoreVertical
															aria-hidden="true"
															className="h-4 w-4 text-ink-muted"
														/>
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													{actions.canChangeRole && (
														<DropdownMenuItem
															onSelect={() => onChangeRole(member)}
														>
															{member.role === "manager"
																? tTeam("demote")
																: tTeam("promote")}
														</DropdownMenuItem>
													)}
													{actions.canRemove && (
														<DropdownMenuItem
															onSelect={() => onRemove(member)}
															className="text-red-600 focus:text-red-700"
														>
															{tTeam("remove")}
														</DropdownMenuItem>
													)}
												</DropdownMenuContent>
											</DropdownMenu>
										)}
									</td>
								</tr>
							);
						})}
						{team.invitations.map((invitation) => {
							// Mirrors `memberActions`: an invitation for a role the caller
							// cannot assign is one they cannot manage either.
							const canManage = assignableRoles(role).includes(invitation.role);
							const exhausted = invitation.sendCount >= RESEND_LIMIT;
							const days = daysUntil(invitation.expiresAt);
							const sent = invitation.lastSentAt
								? timeAgo(invitation.lastSentAt, locale, { maxDays: 30 })
								: null;
							return (
								<tr key={invitation.id} className="bg-[#FFFDF5]">
									<td className="px-[18px] py-3">
										<div className="flex items-center gap-3">
											<Avatar className="h-[38px] w-[38px]">
												<AvatarFallback className="bg-subtle text-ink-faint">
													?
												</AvatarFallback>
											</Avatar>
											<div className="min-w-0">
												<p className="font-semibold text-ink">
													{invitation.maskedTarget}
												</p>
												<p className="text-ink-muted text-xs">
													{invitation.invitedByName
														? tPage("invitedBy", {
																name: invitation.invitedByName,
															})
														: tPage(
																invitation.channel === "phone"
																	? "sentBySms"
																	: "sentByEmail",
															)}
												</p>
											</div>
										</div>
									</td>
									<td className="px-3 py-3">
										<Badge variant={ROLE_BADGE[invitation.role]}>
											{tTeam(ROLE_LABEL_KEY[invitation.role])}
										</Badge>
									</td>
									{showActivity && (
										<td className="px-3 py-3">
											<p className="text-ink-faint">—</p>
											{sent && (
												<p className="text-ink-muted text-xs">
													{tPage("invitedWhen", { when: sent })}
												</p>
											)}
										</td>
									)}
									<td className="px-3 py-3">
										<div className="flex flex-col items-start gap-1">
											<Badge variant="warning">{tPage("statusInvited")}</Badge>
											<span className="text-warn-ink-soft text-xs">
												{days > 0
													? tPage("expiresIn", { count: days })
													: tPage("expiresToday")}
											</span>
										</div>
									</td>
									<td className="px-[18px] py-3 text-right">
										{canManage && (
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														aria-label={tPage("invitationActions", {
															target: invitation.maskedTarget,
														})}
														className={ACTION_BUTTON}
													>
														<MoreVertical
															aria-hidden="true"
															className="h-4 w-4 text-ink-muted"
														/>
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														disabled={
															exhausted || resendingId === invitation.id
														}
														onSelect={() => onResend(invitation)}
													>
														{exhausted
															? tTeam("resendExhausted")
															: tTeam("resend")}
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={revokingId === invitation.id}
														onSelect={() => onRevoke(invitation)}
														className="text-red-600 focus:text-red-700"
													>
														{tTeam("revoke")}
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										)}
									</td>
								</tr>
							);
						})}
						{team.members.length === 0 && team.invitations.length === 0 && (
							<tr>
								<td
									colSpan={columns}
									className="px-[18px] py-6 text-center text-ink-muted"
								>
									{tTeam("pendingEmpty")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}
