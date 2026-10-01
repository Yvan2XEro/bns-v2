export const INBOX_FILTERS = [
	"all",
	"unassigned",
	"mine",
	"unread",
	"awaiting",
	"done",
] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number];

/**
 * `null` means "no database narrowing": `all` needs none, and `unread` cannot
 * have one — it depends on the caller's `conversation-reads` row, which is a
 * different collection, so the list applies it after the read.
 */
export function inboxFilterWhere(
	filter: InboxFilter,
	userId: string,
): Record<string, unknown> | null {
	switch (filter) {
		case "unassigned":
			return { assignee: { exists: false } };
		case "mine":
			return { assignee: { equals: userId } };
		case "awaiting":
			return { awaitingReply: { equals: true } };
		case "done":
			return { inboxStatus: { equals: "done" } };
		default:
			return null;
	}
}

/**
 * Derived at read time from the messages and the caller's mark, never stored.
 * A member's own messages are never unread for them, which is why the sender
 * comparison is here rather than in the query.
 */
export function unreadCountFor(
	messages: Array<{ createdAt: string; sender: string }>,
	userId: string,
	lastReadAt: string | null,
): number {
	const mark = lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY;
	return messages.filter(
		(message) =>
			message.sender !== userId && Date.parse(message.createdAt) > mark,
	).length;
}
