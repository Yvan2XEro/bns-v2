"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

/**
 * Whether someone other than the viewer is typing in this thread — the same
 * `typing` events the personal messages screen and the mobile app show. A
 * stop that never arrives (a closed tab) clears itself after a few seconds.
 */
export function useConversationTyping(
	conversationId: string | null,
	viewerId: string,
): boolean {
	const { chatClient } = useChatClient();
	const [typing, setTyping] = useState(false);

	useEffect(() => {
		setTyping(false);
		if (!chatClient || !conversationId) return;
		let expiry: ReturnType<typeof setTimeout> | undefined;
		const onTyping = (event: {
			conversationId: string;
			userId: string;
			isTyping: boolean;
		}) => {
			if (event.conversationId !== conversationId) return;
			if (String(event.userId) === viewerId) return;
			clearTimeout(expiry);
			setTyping(event.isTyping);
			if (event.isTyping) expiry = setTimeout(() => setTyping(false), 6000);
		};
		chatClient.on("typing", onTyping);
		return () => {
			clearTimeout(expiry);
			chatClient.off("typing", onTyping);
		};
	}, [chatClient, conversationId, viewerId]);

	return typing;
}
