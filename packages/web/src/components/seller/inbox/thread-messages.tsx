"use client";

import { useTranslations } from "next-intl";
import { OrderHeaderCard } from "~/components/chat/order-header-card";
import { SystemChip } from "~/components/chat/system-chip";
import { isSystemMessage } from "~/lib/system-message";
import { cn } from "~/lib/utils";
import type { Message } from "~/types";

function senderName(message: Message, viewerId: string): string | null {
	if (message.senderSide !== "shop") return null;
	const sender = message.sender;
	// P4 made `sender` nullable on the collection, which is what surfaced the
	// missing guard here: an unpopulated or absent sender used to be
	// unreachable by the types and is now the ordinary case.
	if (!sender || typeof sender === "string") return null;
	if (sender.id === viewerId) return null;
	return sender.name ?? null;
}

export function ThreadMessages({
	messages,
	viewerId,
	isLoading,
	typing = false,
}: {
	messages: Message[] | undefined;
	viewerId: string;
	isLoading: boolean;
	/** Someone else in the thread is typing. */
	typing?: boolean;
}) {
	const t = useTranslations("Inbox");
	if (isLoading) return null;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
			<OrderHeaderCard messages={messages ?? []} side="shop" />
			{(messages ?? []).map((message) => {
				if (isSystemMessage(message)) {
					return <SystemChip key={message.id} message={message} />;
				}
				const fromShop = message.senderSide === "shop";
				const name = senderName(message, viewerId);
				return (
					<div
						key={message.id}
						className={cn("flex", fromShop ? "justify-end" : "justify-start")}
					>
						<div
							className={cn(
								"max-w-[70%] rounded-2xl px-4 py-2",
								fromShop
									? "rounded-br-md bg-[var(--shop-accent,#1E40AF)] text-[var(--shop-on-accent,#FFFFFF)]"
									: "rounded-bl-md bg-[#F1F5F9] text-[#0F172A]",
							)}
						>
							{name && (
								<p className="mb-0.5 font-semibold text-[11px] text-white/80">
									{name}
								</p>
							)}
							<p className="whitespace-pre-wrap text-sm">{message.content}</p>
						</div>
					</div>
				);
			})}
			<div aria-live="polite" className="min-h-0">
				{typing && (
					<div className="flex justify-start">
						<span className="sr-only">{t("typing")}</span>
						<div
							aria-hidden="true"
							className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-[#F1F5F9] px-4 py-3"
						>
							{[0, 150, 300].map((delay) => (
								<span
									key={delay}
									className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#94A3B8] motion-reduce:animate-none"
									style={{ animationDelay: `${delay}ms` }}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
