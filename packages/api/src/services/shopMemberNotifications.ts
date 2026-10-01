import type { PayloadRequest } from "payload";
import type { CounterStore } from "../lib/rateLimit";

export interface NotificationDeps {
	store?: CounterStore;
	now?: () => number;
}

export interface InboxMessageNotification {
	conversationId: string;
	shopId: string;
	senderId: string;
	preview: string;
}

/** Task 12 implements the routing; this keeps the import resolvable meanwhile. */
export async function notifyShopInboxMessage(
	_req: PayloadRequest,
	_input: InboxMessageNotification,
	_deps: NotificationDeps = {},
): Promise<void> {
	// Intentionally empty: Task 12 replaces this body with the real routing.
}
