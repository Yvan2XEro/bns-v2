import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ConversationScreen } from "@/src/components/messages/ConversationScreen";
import { useMarkConversationRead } from "@/src/hooks/useShopInbox";
import { api } from "@/src/lib/api";
import type { Conversation, Message, PayloadDoc } from "@/src/types/api";

function unwrapDoc<T>(value: PayloadDoc<T> | T): T {
	return value && typeof value === "object" && "doc" in value
		? (value as PayloadDoc<T>).doc
		: (value as T);
}

function shopIdOf(conv: Conversation | undefined): string | null {
	return conv?.shop && typeof conv.shop === "object" ? conv.shop.id : null;
}

export default function MessagesConversationScreen() {
	const { conversationId, listing } = useLocalSearchParams<{
		conversationId: string;
		listing?: string;
	}>();

	// Shares its cache with `ConversationScreen`'s own query (same key), so
	// this adds no extra request — just a read of the same data to find a
	// shop id and the latest message, both needed to mark the thread read.
	const conv = useQuery({
		queryKey: ["conversation", conversationId],
		queryFn: () =>
			api.get<Conversation | PayloadDoc<Conversation>>(
				`/api/conversations/${conversationId}?depth=2`,
			),
		enabled: !!conversationId,
	});
	const latest = useQuery({
		queryKey: ["messages", conversationId],
		queryFn: () =>
			api.get<{ docs: Message[] }>(
				`/api/messages?where[conversation][equals]=${conversationId}&sort=createdAt&limit=100&depth=1`,
			),
		enabled: !!conversationId,
	});

	const shopId = conv.data ? shopIdOf(unwrapDoc(conv.data)) : null;
	const markRead = useMarkConversationRead(shopId ?? "");

	// `/api/conversations/{id}/read` is the route both clients use (a
	// per-message PATCH is refused by the collection's own access control) —
	// called on focus so re-opening this thread, not just the socket's live
	// read-on-view, clears its unread count.
	useFocusEffect(
		useCallback(() => {
			const lastMessageId = latest.data?.docs.at(-1)?.id;
			if (conversationId && lastMessageId) {
				markRead.mutate({ conversationId, lastMessageId });
			}
		}, [conversationId, latest.data, markRead.mutate]),
	);

	if (!conversationId) return null;

	return (
		<ConversationScreen
			conversationId={conversationId}
			listingParam={listing}
		/>
	);
}
