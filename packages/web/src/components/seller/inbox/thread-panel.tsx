"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useMarkConversationRead } from "~/hooks/use-shop-inbox";
import type { InboxConversationView, ShopRole } from "~/types";
import { ThreadComposer } from "./thread-composer";
import { ThreadHeader } from "./thread-header";
import { ThreadMessages } from "./thread-messages";
import {
	useConversationMessages,
	useConversationThreadSocket,
} from "./use-conversation-thread";

export function ThreadPanel({
	shopId,
	conversation,
	role,
	viewerId,
	onClose,
}: {
	shopId: string;
	conversation: InboxConversationView | null;
	role: ShopRole | null;
	viewerId: string;
	onClose: () => void;
}) {
	const t = useTranslations("Inbox");
	const conversationId = conversation?.id ?? null;
	const { data: messages, isLoading } = useConversationMessages(conversationId);
	useConversationThreadSocket(conversationId);
	const markRead = useMarkConversationRead();
	const lastReadIdRef = useRef<string | null>(null);

	const newestMessageId = messages?.at(-1)?.id ?? null;

	// Marks the thread read whenever its newest message changes — on first
	// open and again as new messages arrive while the panel stays open.
	useEffect(() => {
		if (!conversationId || !newestMessageId) return;
		if (lastReadIdRef.current === newestMessageId) return;
		lastReadIdRef.current = newestMessageId;
		markRead.mutate({ conversationId, lastMessageId: newestMessageId, shopId });
	}, [conversationId, newestMessageId, shopId, markRead]);

	if (!conversation) {
		return (
			<div className="flex h-full items-center justify-center text-[#94A3B8] text-sm">
				{t("empty")}
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ThreadHeader
				shopId={shopId}
				conversation={conversation}
				role={role}
				viewerId={viewerId}
				onClose={onClose}
			/>
			<ThreadMessages
				messages={messages}
				viewerId={viewerId}
				isLoading={isLoading}
			/>
			<ThreadComposer conversationId={conversation.id} />
		</div>
	);
}
