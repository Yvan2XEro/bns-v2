"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useChatClient } from "~/hooks/use-chat-client";
import { apiGet } from "~/lib/shop-api";
import type { Message } from "~/types";

export const conversationMessagesKey = (conversationId: string | null) =>
	["conversations", conversationId ?? "", "messages"] as const;

/** The same `/api/messages` read the personal messages screen already uses. */
export function useConversationMessages(conversationId: string | null) {
	return useQuery<Message[]>({
		queryKey: conversationMessagesKey(conversationId),
		queryFn: () =>
			apiGet<{ docs: Message[] }>(
				`/api/messages?where[conversation][equals]=${conversationId}&sort=createdAt&depth=1`,
			).then((page) => page.docs),
		enabled: Boolean(conversationId),
	});
}

/**
 * Joins the one conversation room the panel currently shows and invalidates
 * its message query on arrival — a subscription, not a loader, same
 * reasoning as `useShopInboxSocket`.
 */
export function useConversationThreadSocket(conversationId: string | null) {
	const { chatClient } = useChatClient();
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!chatClient || !conversationId) return;

		void chatClient.joinConversation(conversationId);

		const invalidate = () => {
			queryClient.invalidateQueries({
				queryKey: conversationMessagesKey(conversationId),
			});
		};

		chatClient.on("message:new", invalidate);
		chatClient.on("message:confirmed", invalidate);

		return () => {
			chatClient.off("message:new", invalidate);
			chatClient.off("message:confirmed", invalidate);
			chatClient.leaveConversation(conversationId);
		};
	}, [chatClient, conversationId, queryClient]);
}
