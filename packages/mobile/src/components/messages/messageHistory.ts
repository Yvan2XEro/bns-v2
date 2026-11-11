import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api";

/**
 * A thread's messages, oldest first, as the screen draws them. Held under
 * `["messages", conversationId]` by `ConversationScreen` and read (same key,
 * same fetcher) by `BuyerConversation` to mark the thread read.
 */
export interface MessagePage<T = any> {
	docs: T[];
	/** More history exists above the oldest message held. */
	hasOlder: boolean;
}

export const MESSAGES_PAGE_SIZE = 50;

export function messagesKey(conversationId: string) {
	return ["messages", conversationId] as const;
}

interface PayloadList<T> {
	docs: T[];
	hasNextPage?: boolean;
}

function url(conversationId: string, before?: string) {
	const older = before
		? `&where[createdAt][less_than]=${encodeURIComponent(before)}`
		: "";
	return `/api/messages?where[conversation][equals]=${conversationId}${older}&sort=-createdAt&limit=${MESSAGES_PAGE_SIZE}&depth=1`;
}

/**
 * The newest page. A refetch keeps the history already scrolled into, and a
 * message that failed to send, rather than dropping them: the thread would
 * jump, and the failed text could no longer be retried.
 */
export async function fetchLatestMessages(
	queryClient: QueryClient,
	conversationId: string,
): Promise<MessagePage> {
	const res = await api.get<PayloadList<any>>(url(conversationId));
	const latest = [...(res.docs ?? [])].reverse();
	const held = queryClient.getQueryData<MessagePage>(
		messagesKey(conversationId),
	);
	if (!held?.docs?.length) {
		return { docs: latest, hasOlder: Boolean(res.hasNextPage) };
	}

	const ids = new Set(latest.map((m) => m.id));
	const oldest: string | undefined = latest[0]?.createdAt;
	const keptOlder = oldest
		? held.docs.filter(
				(m) => !m.failed && !ids.has(m.id) && String(m.createdAt) < oldest,
			)
		: [];
	const failed = held.docs.filter((m) => m.failed && !ids.has(m.id));
	return {
		docs: [...keptOlder, ...latest, ...failed],
		hasOlder:
			keptOlder.length > 0 ? Boolean(held.hasOlder) : Boolean(res.hasNextPage),
	};
}

/** The page just above `before` (an ISO date), oldest first. */
export async function fetchOlderMessages(
	conversationId: string,
	before: string,
): Promise<MessagePage> {
	const res = await api.get<PayloadList<any>>(url(conversationId, before));
	return {
		docs: [...(res.docs ?? [])].reverse(),
		hasOlder: Boolean(res.hasNextPage),
	};
}
