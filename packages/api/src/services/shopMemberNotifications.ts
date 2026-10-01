import type { PayloadRequest } from "payload";
import type { ShopRole } from "../access/shopRoles";
import type { InvitationChannel } from "../lib/invitationTargets";
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

export interface InvitationNotification {
	invitationId: string;
	shopId: string;
	shopName: string;
	inviterName: string | null;
	role: "manager" | "staff";
	channel: InvitationChannel;
	target: string;
	token: string;
	/** The existing account behind the target, when there is one. */
	existingUserId: string | null;
}

/** Task 12 implements every function here; the no-ops keep the imports resolvable. */
export async function notifyShopInboxMessage(
	_req: PayloadRequest,
	_input: InboxMessageNotification,
	_deps: NotificationDeps = {},
): Promise<void> {
	// Intentionally empty: Task 12 replaces this body with the real routing.
}

export async function notifyShopInvitation(
	_input: InvitationNotification,
): Promise<void> {}

export async function notifyInvitationAccepted(_input: {
	shopId: string;
	shopName: string;
	memberName: string | null;
	role: ShopRole;
	recipientIds: string[];
}): Promise<void> {}

export async function notifyInvitationDeclined(_input: {
	shopId: string;
	shopName: string;
	maskedTarget: string;
	inviterId: string;
}): Promise<void> {}

export async function notifyMemberRemoved(_input: {
	shopId: string;
	shopName: string;
	userId: string;
}): Promise<void> {}

export async function notifyMemberRoleChanged(_input: {
	shopId: string;
	shopName: string;
	userId: string;
	role: ShopRole;
}): Promise<void> {}

export async function notifyShopTeamPaused(_input: {
	shopId: string;
	shopName: string;
	ownerId: string;
	memberIds: string[];
}): Promise<void> {}

export async function notifyConversationAssigned(_input: {
	shopId: string;
	shopName: string;
	conversationId: string;
	assigneeId: string;
	assignedByName: string | null;
}): Promise<void> {}
