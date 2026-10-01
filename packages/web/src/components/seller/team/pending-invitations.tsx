"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { assignableRoles } from "~/lib/team-form";
import type { PendingInvitationView, ShopRole } from "~/types";

const RESEND_LIMIT = 3;

export function PendingInvitations({
	invitations,
	role,
	onResend,
	onRevoke,
	resendingId,
	revokingId,
}: {
	invitations: PendingInvitationView[];
	role: ShopRole | null;
	onResend: (invitation: PendingInvitationView) => void;
	onRevoke: (invitation: PendingInvitationView) => void;
	resendingId: string | null;
	revokingId: string | null;
}) {
	const t = useTranslations("Team");
	const locale = useLocale();

	return (
		<div className="rounded-2xl border border-[#DBEAFE] bg-white p-4">
			<h2 className="font-semibold text-[#0F172A] text-sm">{t("pending")}</h2>
			{invitations.length === 0 ? (
				<p className="mt-2 text-[#64748B] text-sm">{t("pendingEmpty")}</p>
			) : (
				<ul className="mt-3 space-y-2">
					{invitations.map((invitation) => {
						// Mirrors `memberActions`: an invitation for a role the caller
						// cannot assign is one they cannot manage either — a manager
						// never sees Resend/Revoke on another manager's invitation.
						const canManage = assignableRoles(role).includes(invitation.role);
						const exhausted = invitation.sendCount >= RESEND_LIMIT;
						const expires = new Date(invitation.expiresAt).toLocaleDateString(
							locale,
							{ day: "numeric", month: "short", year: "numeric" },
						);

						return (
							<li
								key={invitation.id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F1F5F9] px-3 py-2"
							>
								<div className="min-w-0">
									<p className="font-medium text-[#0F172A] text-sm">
										{invitation.maskedTarget}
									</p>
									<p className="text-[#64748B] text-xs">
										{t(
											invitation.role === "manager"
												? "roleManager"
												: "roleStaff",
										)}
										{" · "}
										{t("expires", { date: expires })}
									</p>
								</div>
								{canManage && (
									<div className="flex items-center gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={exhausted || resendingId === invitation.id}
											title={exhausted ? t("resendExhausted") : undefined}
											onClick={() => onResend(invitation)}
										>
											{t("resend")}
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={revokingId === invitation.id}
											onClick={() => onRevoke(invitation)}
											className="text-red-600 hover:text-red-700"
										>
											{t("revoke")}
										</Button>
										{exhausted && (
											<Badge variant="warning">{t("resendExhausted")}</Badge>
										)}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
