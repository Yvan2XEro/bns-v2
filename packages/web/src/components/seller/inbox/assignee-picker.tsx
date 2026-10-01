"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAssignConversation } from "~/hooks/use-shop-inbox";
import { useShopTeam } from "~/hooks/use-shop-team";
import { assignableMembers } from "~/lib/active-shop";
import { resolveErrorMessage } from "~/lib/apiError";
import type { InboxConversationView, ShopRole } from "~/types";

/**
 * Never holds its own copy of "who is assigned": the trigger's label reads
 * `conversation.assignee` straight from the inbox query. A race is settled
 * server-side — `useAssignConversation`'s `onSuccess` invalidates that query
 * on every caller, winner and loser alike — so the picker lands on whatever
 * the refetch says, never on the choice it made locally.
 */
export function AssigneePicker({
	shopId,
	conversation,
	role,
	viewerId,
}: {
	shopId: string;
	conversation: InboxConversationView;
	role: ShopRole | null;
	viewerId: string;
}) {
	const t = useTranslations("Inbox");
	const tRoot = useTranslations();
	const { data: team } = useShopTeam(shopId);
	const assignConversation = useAssignConversation(shopId);
	const candidates = assignableMembers(team, role, viewerId);

	function assign(userId: string | null) {
		assignConversation.mutate(
			{ conversationId: conversation.id, userId },
			{
				onError: (error) => {
					toast.error(resolveErrorMessage(error, tRoot, t("assign")));
				},
			},
		);
	}

	const assignee = conversation.assignee;
	const label = assignee ? (assignee.name ?? t("assignee")) : t("unassigned");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={assignConversation.isPending}
				className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-left text-sm disabled:opacity-60"
			>
				{assignConversation.isPending && (
					<Loader2 className="h-3.5 w-3.5 animate-spin text-[#64748B]" />
				)}
				<span className="truncate">{label}</span>
				{assignee?.suspended && (
					<span className="rounded-full bg-[#FEF3C7] px-1.5 text-[#92400E] text-[10px]">
						{t("suspendedAssignee")}
					</span>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{assignee && (
					<DropdownMenuItem onClick={() => assign(null)}>
						{t("unassign")}
					</DropdownMenuItem>
				)}
				{candidates.map((member) => (
					<DropdownMenuItem
						key={member.userId}
						onClick={() => assign(member.userId)}
						disabled={assignee?.id === member.userId}
					>
						{member.userId === viewerId ? t("assignToMe") : member.name}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
