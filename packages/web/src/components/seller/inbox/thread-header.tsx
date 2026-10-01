"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { useConversationStatus } from "~/hooks/use-shop-inbox";
import { resolveErrorMessage } from "~/lib/apiError";
import type { InboxConversationView, ShopRole } from "~/types";
import { AssigneePicker } from "./assignee-picker";

export function ThreadHeader({
	shopId,
	conversation,
	role,
	viewerId,
	onClose,
}: {
	shopId: string;
	conversation: InboxConversationView;
	role: ShopRole | null;
	viewerId: string;
	onClose: () => void;
}) {
	const t = useTranslations("Inbox");
	const tRoot = useTranslations();
	const setStatus = useConversationStatus(shopId);
	const done = conversation.inboxStatus === "done";

	function toggleStatus() {
		setStatus.mutate(
			{ conversationId: conversation.id, status: done ? "open" : "done" },
			{
				onError: (error) => {
					toast.error(resolveErrorMessage(error, tRoot, t("markDone")));
				},
			},
		);
	}

	return (
		<div className="flex items-center gap-3 border-[#E2E8F0] border-b p-3">
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="shrink-0 lg:hidden"
				onClick={onClose}
			>
				<ArrowLeft className="h-4 w-4" />
			</Button>
			<Avatar className="h-9 w-9 shrink-0">
				<AvatarImage src={conversation.buyer?.avatarUrl ?? undefined} />
				<AvatarFallback className="bg-[#1E40AF] text-white text-xs">
					{conversation.buyer?.name?.charAt(0) ?? "?"}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-[#0F172A] text-sm">
					{conversation.buyer?.name ?? t("unassigned")}
				</p>
				{conversation.listing && (
					<Link
						href={`/listing/${conversation.listing.id}`}
						className="truncate text-[#1E40AF] text-xs hover:underline"
					>
						{conversation.listing.title}
					</Link>
				)}
			</div>
			<AssigneePicker
				shopId={shopId}
				conversation={conversation}
				role={role}
				viewerId={viewerId}
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={setStatus.isPending}
				onClick={toggleStatus}
			>
				{done ? t("reopen") : t("markDone")}
			</Button>
		</div>
	);
}
