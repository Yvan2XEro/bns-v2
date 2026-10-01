"use client";

import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import type { InboxConversationView } from "~/types";

/** Short enough that a precise timestamp would be noise in a scanning list. */
function relativeTime(iso: string, locale: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const diffMin = Math.round(diffMs / 60_000);
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	if (diffMin < 60) return formatter.format(-diffMin, "minute");
	const diffHour = Math.round(diffMin / 60);
	if (diffHour < 24) return formatter.format(-diffHour, "hour");
	const diffDay = Math.round(diffHour / 24);
	return formatter.format(-diffDay, "day");
}

export function ConversationList({
	conversations,
	selectedId,
	onSelect,
	q,
	onQueryChange,
	isLoading,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	locale,
}: {
	conversations: InboxConversationView[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	q: string;
	onQueryChange: (q: string) => void;
	isLoading: boolean;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
	locale: string;
}) {
	const t = useTranslations("Inbox");

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-[#E2E8F0] border-b p-2">
				<Input
					value={q}
					onChange={(e) => onQueryChange(e.target.value)}
					placeholder={t("search")}
					aria-label={t("search")}
				/>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{!isLoading && conversations.length === 0 && (
					<p className="p-4 text-center text-[#64748B] text-sm">
						{q ? t("emptyFiltered") : t("empty")}
					</p>
				)}
				{conversations.map((conversation) => {
					const active = conversation.id === selectedId;
					return (
						<button
							key={conversation.id}
							type="button"
							onClick={() => onSelect(conversation.id)}
							className={cn(
								"flex w-full items-start gap-3 border-[#F1F5F9] border-b px-3 py-3 text-left",
								active ? "bg-[#EFF6FF]" : "hover:bg-[#F8FAFC]",
							)}
						>
							<Avatar className="h-9 w-9 shrink-0">
								<AvatarImage src={conversation.buyer?.avatarUrl ?? undefined} />
								<AvatarFallback className="bg-[#1E40AF] text-white text-xs">
									{conversation.buyer?.name?.charAt(0) ?? "?"}
								</AvatarFallback>
							</Avatar>
							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-2">
									<p className="truncate font-medium text-[#0F172A] text-sm">
										{conversation.buyer?.name ?? t("unassigned")}
									</p>
									{conversation.lastMessage && (
										<span className="shrink-0 text-[#94A3B8] text-xs">
											{relativeTime(conversation.lastMessage.at, locale)}
										</span>
									)}
								</div>
								{conversation.listing && (
									<p className="truncate text-[#64748B] text-xs">
										{conversation.listing.title}
									</p>
								)}
								{conversation.lastMessage && (
									<p className="truncate text-[#64748B] text-sm">
										{conversation.lastMessage.preview}
									</p>
								)}
							</div>
							<div className="flex shrink-0 flex-col items-end gap-1">
								{conversation.unreadCount > 0 && (
									<span className="h-2 w-2 rounded-full bg-[#1E40AF]" />
								)}
								{conversation.assignee ? (
									<Avatar
										className={cn(
											"h-5 w-5",
											conversation.assignee.suspended && "opacity-50",
										)}
										title={
											conversation.assignee.suspended
												? t("suspendedAssignee")
												: (conversation.assignee.name ?? undefined)
										}
									>
										<AvatarImage
											src={conversation.assignee.avatarUrl ?? undefined}
										/>
										<AvatarFallback className="bg-[#94A3B8] text-[9px] text-white">
											{conversation.assignee.name?.charAt(0) ?? "?"}
										</AvatarFallback>
									</Avatar>
								) : null}
							</div>
						</button>
					);
				})}
			</div>
			{hasNextPage && (
				<div className="border-[#E2E8F0] border-t p-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full"
						disabled={isFetchingNextPage}
						onClick={onLoadMore}
					>
						{t("loadMore")}
					</Button>
				</div>
			)}
		</div>
	);
}
