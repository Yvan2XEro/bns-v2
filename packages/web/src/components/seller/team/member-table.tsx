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
import { memberActions } from "~/lib/team-form";
import type { ShopRole, TeamMemberView } from "~/types";

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

export function MemberTable({
	members,
	role,
	onChangeRole,
	onRemove,
}: {
	members: TeamMemberView[];
	role: ShopRole | null;
	onChangeRole: (member: TeamMemberView) => void;
	onRemove: (member: TeamMemberView) => void;
}) {
	const t = useTranslations("Team");
	const locale = useLocale();

	return (
		<div className="overflow-hidden rounded-2xl border border-[#DBEAFE] bg-white">
			<table className="w-full text-sm">
				<thead className="bg-[#F8FAFF] text-left text-[#64748B] text-xs">
					<tr>
						<th className="px-4 py-3 font-medium">{t("members")}</th>
						<th className="px-4 py-3 font-medium">{t("roleLabel")}</th>
						<th className="px-4 py-3 font-medium">{t("joined")}</th>
						<th className="px-4 py-3" />
					</tr>
				</thead>
				<tbody className="divide-y divide-[#F1F5F9]">
					{members.map((member) => {
						const actions = memberActions(role, member);
						const joined = member.joinedAt
							? new Date(member.joinedAt).toLocaleDateString(locale, {
									day: "numeric",
									month: "short",
									year: "numeric",
								})
							: "—";

						return (
							<tr key={member.id}>
								<td className="flex items-center gap-3 px-4 py-3">
									<Avatar className="h-8 w-8">
										<AvatarImage
											src={member.avatarUrl ?? undefined}
											alt={member.name ?? ""}
										/>
										<AvatarFallback>
											{(member.name ?? "?").slice(0, 1).toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<span className="font-medium text-[#0F172A]">
										{member.name ?? "—"}
									</span>
									{member.suspended && (
										<Badge variant="destructive">{t("suspended")}</Badge>
									)}
								</td>
								<td className="px-4 py-3">
									<Badge
										variant={ROLE_BADGE[member.role]}
										title={t(`${ROLE_LABEL_KEY[member.role]}Description`)}
									>
										{t(ROLE_LABEL_KEY[member.role])}
									</Badge>
								</td>
								<td className="px-4 py-3 text-[#64748B]">{joined}</td>
								<td className="px-4 py-3 text-right">
									{(actions.canChangeRole || actions.canRemove) && (
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<button
													type="button"
													aria-label={t("members")}
													className="rounded-lg p-1.5 hover:bg-[#F1F5F9]"
												>
													<MoreVertical
														aria-hidden="true"
														className="h-4 w-4 text-[#64748B]"
													/>
												</button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												{actions.canChangeRole && (
													<DropdownMenuItem
														onSelect={() => onChangeRole(member)}
													>
														{member.role === "manager"
															? t("demote")
															: t("promote")}
													</DropdownMenuItem>
												)}
												{actions.canRemove && (
													<DropdownMenuItem
														onSelect={() => onRemove(member)}
														className="text-red-600 focus:text-red-700"
													>
														{t("remove")}
													</DropdownMenuItem>
												)}
											</DropdownMenuContent>
										</DropdownMenu>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
