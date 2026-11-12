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
	// Sent from here but not stored yet (on its way, failed, or left over from
	// a run of the app that was killed): kept, or the bubble would vanish and
	// come back. Dropped once the server holds the same words from the same
	// sender, which is its stored copy.
	const unsent = held.docs.filter(
		(m) =>
			(m.failed || m.optimistic) &&
			!ids.has(m.id) &&
			!latest.some((stored) => isStoredCopy(stored, m)),
	);
	return {
		docs: [...keptOlder, ...latest, ...unsent],
		hasOlder:
			keptOlder.length > 0 ? Boolean(held.hasOlder) : Boolean(res.hasNextPage),
	};
}

/**
 * The newest message the server holds — what "read up to here" may name.
 * A bubble still on its way (or never sent) has only a temporary id.
 */
export function lastStoredMessageId(
	docs: any[] | undefined,
): string | undefined {
	return docs?.findLast((m) => !m?.optimistic && !m?.failed)?.id;
}

/** How far apart a stored message and a local copy of it may be dated. */
const STORED_COPY_WINDOW_MS = 10 * 60_000;

function senderIdOf(m: any): string | undefined {
	return m?.sender?.id ?? m?.sender;
}

function isStoredCopy(stored: any, local: any): boolean {
	if (stored?.content !== local?.content) return false;
	if (senderIdOf(stored) !== senderIdOf(local)) return false;
	// Stored after the local copy was made (a minute's leeway for the phone's
	// clock): an identical "ok" sent earlier is not this one.
	const gap =
		new Date(stored.createdAt).getTime() - new Date(local.createdAt).getTime();
	return gap > -60_000 && gap < STORED_COPY_WINDOW_MS;
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
