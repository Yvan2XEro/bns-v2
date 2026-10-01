import type { Payload, PayloadRequest } from "payload";
import { isSuspended } from "../access/roles";
import { can, resolveShopRole, type ShopRole } from "../access/shopRoles";
import { triggerNotificationEvent } from "../hooks/notificationEvents";
import type { InvitationChannel } from "../lib/invitationTargets";
import {
	type CounterStore,
	getCounterStore,
	hitRateLimit,
	type RateLimitWindow,
} from "../lib/rateLimit";
import { relationId } from "../lib/relationId";
import { isNotificationProviderConfigured } from "./notificationProvider";

const webUrl = () => process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com";

/**
 * One push per conversation per recipient per two minutes. A buyer typing
 * three short messages in a row is one notification, not three buzzing
 * phones across the whole team.
 */
export const INBOX_PUSH_THROTTLE: readonly RateLimitWindow[] = [
	{ name: "notif:inbox", limit: 1, windowSeconds: 120 },
];

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

async function fire(
	event: string,
	subscriberId: string,
	payload: Record<string, string | number | boolean | null | undefined>,
	email?: string,
): Promise<void> {
	if (!isNotificationProviderConfigured()) return;
	await triggerNotificationEvent({ event, subscriberId, payload, email });
}

/**
 * Assigned: the assignee alone, unless their preference is `none`.
 * Unassigned: every member holding `inbox.reply` whose preference is `all`.
 * The sender and suspended members are never notified.
 */
export async function inboxNotificationRecipients(
	payload: Payload,
	input: { shopId: string; conversationId: string; senderId: string },
	req?: PayloadRequest,
): Promise<string[]> {
	const shop = await payload
		.findByID({
			collection: "shops",
			id: input.shopId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!shop || shop.status !== "active") return [];

	const conversation = await payload
		.findByID({
			collection: "conversations",
			id: input.conversationId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!conversation) return [];
	const assigneeId = relationId(conversation.assignee);

	const rows = await payload.find({
		collection: "shop-members",
		where: {
			and: [
				{ shop: { equals: input.shopId } },
				{ status: { equals: "active" } },
			],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});

	const context: Record<string, unknown> = {};
	const recipients: string[] = [];
	for (const row of rows.docs) {
		const userId = relationId(row.user);
		if (!userId || userId === input.senderId) continue;
		if (assigneeId && userId !== assigneeId) continue;
		if (row.inboxNotifications === "none") continue;
		if (!assigneeId && row.inboxNotifications !== "all") continue;

		const role = await resolveShopRole(payload, userId, input.shopId, context);
		if (!can(role, "inbox.reply")) continue;
		const user = await payload
			.findByID({
				collection: "users",
				id: userId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (!user || isSuspended(user)) continue;
		recipients.push(userId);
	}
	return recipients;
}

export async function notifyShopInboxMessage(
	req: PayloadRequest,
	input: InboxMessageNotification,
	deps: NotificationDeps = {},
): Promise<void> {
	const recipients = await inboxNotificationRecipients(req.payload, input, req);
	if (recipients.length === 0) return;

	const shop = await req.payload
		.findByID({
			collection: "shops",
			id: input.shopId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	const conversation = await req.payload
		.findByID({
			collection: "conversations",
			id: input.conversationId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	const buyerId = relationId(conversation?.buyer);
	const buyer = buyerId
		? await req.payload
				.findByID({
					collection: "users",
					id: buyerId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null)
		: null;

	const store = deps.store ?? getCounterStore();
	const nowMs = deps.now?.() ?? Date.now();

	for (const userId of recipients) {
		// The key is the spec's `notif:inbox:{conversationId}:{userId}`; the
		// window number `hitRateLimit` appends is what makes it expire.
		if (
			await hitRateLimit(
				store,
				`${input.conversationId}:${userId}`,
				INBOX_PUSH_THROTTLE,
				nowMs,
			)
		) {
			continue;
		}
		await fire("shop-inbox-message", userId, {
			shopId: input.shopId,
			shopName: shop?.name ?? "",
			conversationId: input.conversationId,
			buyerName: buyer?.name ?? "",
			messagePreview: input.preview,
		});
	}
}

export async function notifyShopInvitation(
	input: InvitationNotification,
): Promise<void> {
	const payload = {
		shopId: input.shopId,
		shopName: input.shopName,
		inviterName: input.inviterName ?? "",
		role: input.role,
		inviteUrl: `${webUrl()}/invite/${input.token}`,
	};

	// An email invitation reaches an address, which Novu turns into an inline
	// subscriber `invite-{invitationId}`. A phone invitation is carried by the
	// SMS, so Novu is only used for the in-app copy an existing account gets.
	if (input.channel === "email" && !input.existingUserId) {
		await fire(
			"shop-invitation",
			`invite-${input.invitationId}`,
			payload,
			input.target,
		);
		return;
	}
	if (input.existingUserId) {
		await fire("shop-invitation", input.existingUserId, payload);
	}
}

export async function notifyInvitationAccepted(input: {
	shopId: string;
	shopName: string;
	memberName: string | null;
	role: ShopRole;
	recipientIds: string[];
}): Promise<void> {
	for (const userId of [...new Set(input.recipientIds)]) {
		await fire("shop-invitation-accepted", userId, {
			shopId: input.shopId,
			shopName: input.shopName,
			memberName: input.memberName ?? "",
			role: input.role,
		});
	}
}

export async function notifyInvitationDeclined(input: {
	shopId: string;
	shopName: string;
	maskedTarget: string;
	inviterId: string;
}): Promise<void> {
	await fire("shop-invitation-declined", input.inviterId, {
		shopId: input.shopId,
		shopName: input.shopName,
		maskedTarget: input.maskedTarget,
	});
}

export async function notifyMemberRemoved(input: {
	shopId: string;
	shopName: string;
	userId: string;
}): Promise<void> {
	await fire("shop-member-removed", input.userId, {
		shopId: input.shopId,
		shopName: input.shopName,
	});
}

export async function notifyMemberRoleChanged(input: {
	shopId: string;
	shopName: string;
	userId: string;
	role: ShopRole;
}): Promise<void> {
	await fire("shop-member-role-changed", input.userId, {
		shopId: input.shopId,
		shopName: input.shopName,
		role: input.role,
	});
}

export async function notifyShopTeamPaused(input: {
	shopId: string;
	shopName: string;
	ownerId: string;
	memberIds: string[];
}): Promise<void> {
	for (const userId of [input.ownerId, ...input.memberIds]) {
		await fire("shop-team-paused", userId, {
			shopId: input.shopId,
			shopName: input.shopName,
		});
	}
}

export async function notifyConversationAssigned(input: {
	shopId: string;
	shopName: string;
	conversationId: string;
	assigneeId: string;
	assignedByName: string | null;
}): Promise<void> {
	await fire("shop-conversation-assigned", input.assigneeId, {
		shopId: input.shopId,
		shopName: input.shopName,
		conversationId: input.conversationId,
		assignedByName: input.assignedByName ?? "",
	});
}
