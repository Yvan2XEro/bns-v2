"use client";

import { cn } from "~/lib/utils";
import type { Message, User } from "~/types";

function senderName(message: Message, viewerId: string): string | null {
	if (message.senderSide !== "shop") return null;
	const sender = message.sender;
	if (typeof sender === "string") return null;
	if (sender.id === viewerId) return null;
	return (sender as User).name ?? null;
}

export function ThreadMessages({
	messages,
	viewerId,
	isLoading,
}: {
	messages: Message[] | undefined;
	viewerId: string;
	isLoading: boolean;
}) {
	if (isLoading) return null;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
			{(messages ?? []).map((message) => {
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
									? "rounded-br-md bg-[#1E40AF] text-white"
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
		</div>
	);
}
