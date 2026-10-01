import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";
import { inboxShopIds } from "../access/inboxShops";
import { can, resolveShopRole } from "../access/shopRoles";
import {
	assertNotSuspended,
	type SuspensionCheckable,
} from "../hooks/suspensionGuard";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { isChatServiceAccount } from "../lib/serviceAccounts";
import { CodedAPIError } from "../lib/serviceError";
import { isNotificationProviderConfigured } from "../services/notificationProvider";
import { INBOX_SERVICE_CONTEXT } from "./Conversations";

export const Messages: CollectionConfig = {
	slug: "messages",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["conversation", "sender", "content", "createdAt"],
	},
	hooks: {
		beforeChange: [
			async ({ req, data, operation }) => {
				if (operation !== "create") return data;

				// Only chat-service may name someone else as the sender. Every
				// other caller sends as themselves, whatever the body says.
				const named = relationId(data.sender);
				const callerId = relationId(req.user);
				const senderId = isChatServiceAccount(
					req.user as { email?: string | null } | null,
				)
					? (named ?? callerId)
					: callerId;
				if (!senderId) {
					throw new CodedAPIError(ERROR_CODES.messagesNotParticipant, 403);
				}
				data.sender = senderId;

				await assertNotSuspended(
					req.payload,
					senderId,
					req.user as SuspensionCheckable | null,
				);

				const conversationId = relationId(data.conversation);
				if (!conversationId) {
					throw new CodedAPIError(ERROR_CODES.messagesNotParticipant, 403);
				}
				const conversation = await req.payload
					.findByID({
						collection: "conversations",
						id: conversationId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null);
				if (!conversation) {
					throw new CodedAPIError(ERROR_CODES.messagesNotParticipant, 403);
				}

				const participants = ((conversation.participants ?? []) as unknown[])
					.map(relationId)
					.filter((id): id is string => Boolean(id));
				const shopId = relationId(conversation.shop);

				// A participant, or a member of the shop holding `inbox.reply`.
				// Membership is the second door, and the only one revoking a
				// member has to close.
				let isMember = false;
				if (shopId && !participants.includes(senderId)) {
					const role = await resolveShopRole(
						req.payload,
						senderId,
						shopId,
						req.context,
					);
					isMember = can(role, "inbox.reply");
				}
				if (!participants.includes(senderId) && !isMember) {
					throw new CodedAPIError(ERROR_CODES.messagesNotParticipant, 403);
				}

				if (shopId) {
					const shop = await req.payload
						.findByID({
							collection: "shops",
							id: shopId,
							depth: 0,
							overrideAccess: true,
							req,
						})
						.catch(() => null);
					if (!shop || shop.status !== "active") {
						throw new CodedAPIError(ERROR_CODES.shopInactive, 409);
					}
					const buyerId = relationId(conversation.buyer);
					data.senderSide = senderId === buyerId ? "buyer" : "shop";
				}

				const others = participants.filter((id) => id !== senderId);
				if (others.length === 0) return data;

				// Blocking is enforced in both directions: neither party can keep
				// messaging once either side has blocked the other. For a shop
				// conversation `participants` is `[buyer, owner]`, so a block
				// between the buyer and a staff member does not silence the shop.
				const blocks = await req.payload.find({
					collection: "blocked-users",
					depth: 0,
					limit: 1,
					overrideAccess: true,
					req,
					where: {
						or: [
							{
								and: [
									{ blocker: { equals: senderId } },
									{ blocked: { in: others } },
								],
							},
							{
								and: [
									{ blocker: { in: others } },
									{ blocked: { equals: senderId } },
								],
							},
						],
					},
				});
				if (blocks.docs.length > 0) {
					throw new CodedAPIError(ERROR_CODES.messageBlocked, 403);
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation, req }) => {
				if (operation !== "create") return;

				const conversationId = relationId(doc.conversation);
				if (!conversationId) return;
				const senderId = relationId(doc.sender);
				const isShopConversation =
					doc.senderSide === "buyer" || doc.senderSide === "shop";

				// One update, with the service flag, so `beforeChange`'s pinning
				// lets it through and a buyer message reopens the conversation.
				await req.payload.update({
					collection: "conversations",
					id: conversationId,
					req,
					overrideAccess: true,
					context: INBOX_SERVICE_CONTEXT,
					data: {
						lastMessage: doc.id,
						lastMessageAt: doc.createdAt,
						...(isShopConversation
							? {
									awaitingReply: doc.senderSide === "buyer",
									...(doc.senderSide === "buyer"
										? { inboxStatus: "open" }
										: {}),
								}
							: {}),
					},
				});

				if (!isNotificationProviderConfigured()) return;
				try {
					const conversation = await req.payload.findByID({
						collection: "conversations",
						id: conversationId,
						depth: 0,
						overrideAccess: true,
						req,
					});
					const preview =
						doc.content.length > 100
							? `${doc.content.slice(0, 100)}...`
							: doc.content;

					if (doc.senderSide === "buyer") {
						const { notifyShopInboxMessage } = await import(
							"../services/shopMemberNotifications"
						);
						await notifyShopInboxMessage(req, {
							conversationId,
							shopId: relationId(conversation.shop) ?? "",
							senderId: senderId ?? "",
							preview,
						});
						return;
					}

					const { triggerNotificationEvent } = await import(
						"../hooks/notificationEvents"
					);
					if (doc.senderSide === "shop") {
						// The buyer sees the shop, not the member who typed.
						const shopId = relationId(conversation.shop);
						const shop = shopId
							? await req.payload
									.findByID({
										collection: "shops",
										id: shopId,
										depth: 0,
										overrideAccess: true,
										req,
									})
									.catch(() => null)
							: null;
						const buyerId = relationId(conversation.buyer);
						if (buyerId) {
							await triggerNotificationEvent({
								event: "new-message",
								subscriberId: buyerId,
								payload: {
									senderName: shop?.name ?? "",
									messagePreview: preview,
									conversationId,
								},
							});
						}
						return;
					}

					const sender = senderId
						? await req.payload
								.findByID({
									collection: "users",
									id: senderId,
									depth: 0,
									overrideAccess: true,
									req,
								})
								.catch(() => null)
						: null;
					const recipients = ((conversation.participants ?? []) as unknown[])
						.map(relationId)
						.filter((id): id is string => Boolean(id) && id !== senderId);
					for (const recipientId of recipients) {
						await triggerNotificationEvent({
							event: "new-message",
							subscriberId: recipientId,
							payload: {
								senderName: sender?.name ?? "",
								messagePreview: preview,
								conversationId,
							},
						});
					}
				} catch (error) {
					req.payload.logger.error(
						{ err: error, messageId: doc.id },
						"[notifications] failed to notify a new message",
					);
				}
			},
		],
	},
	access: {
		read: async ({ req }) => {
			const user = req.user;
			if (!user) return false;

			const role = (user as { role?: string }).role;
			if (role === "admin" || role === "moderator") return true;

			// Scope reads to conversations the user takes part in, plus the
			// conversations of shops whose inbox they may read. Without this,
			// any signed-in account can read every message in the database.
			const cacheKey = "messageReadConversationIds";
			let ids = req.context?.[cacheKey] as string[] | undefined;

			if (!ids) {
				const shops = await inboxShopIds(req);
				const conversations = await req.payload.find({
					collection: "conversations",
					where:
						shops.length > 0
							? {
									or: [
										{ participants: { equals: user.id } },
										{ shop: { in: shops } },
									],
								}
							: { participants: { equals: user.id } },
					limit: 0,
					depth: 0,
					pagination: false,
					overrideAccess: true,
				});
				ids = conversations.docs.map((doc) => String(doc.id));
				if (req.context) req.context[cacheKey] = ids;
			}

			if (ids.length === 0) return false;

			return {
				conversation: {
					in: ids,
				},
			};
		},
		create: authenticated,
		update: ({ req: { user } }) => {
			if (!user) return false;
			const userWithRole = user as { role?: string };
			return userWithRole.role === "admin" || userWithRole.role === "moderator";
		},
		delete: ({ req: { user } }) => {
			if (!user) return false;
			const userWithRole = user as { role?: string };
			return userWithRole.role === "admin";
		},
	},
	fields: [
		{
			name: "conversation",
			type: "relationship",
			relationTo: "conversations",
			required: true,
		},
		{
			name: "sender",
			type: "relationship",
			relationTo: "users",
			required: true,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "content",
			type: "text",
			required: true,
		},
		{
			name: "listing",
			type: "relationship",
			relationTo: "listings",
			required: false,
		},
		{
			name: "read",
			type: "checkbox",
			defaultValue: false,
		},
		{
			name: "senderSide",
			type: "select",
			index: true,
			options: [
				{ label: "Buyer", value: "buyer" },
				{ label: "Shop", value: "shop" },
			],
			// Derived in `beforeChange` for a shop conversation only. Without
			// this, a body-supplied `senderSide` on a classic conversation
			// routes `afterChange` into the shop notification branch, which
			// resolves no recipient and the message never notifies anyone.
			// `overrideAccess` (the hook's own assignment, and the service
			// paths) bypasses field access entirely, so this only closes the
			// ordinary REST caller.
			access: { create: () => false, update: () => false },
			admin: {
				readOnly: true,
				description: "Set on shop conversations only; absent on a classic one.",
			},
		},
		{
			name: "formerMemberAuthor",
			type: "checkbox",
			defaultValue: false,
			// Written only by account deletion, via `overrideAccess`. REST
			// access control covers only incoming data from a request, not
			// mutations made within a hook via `overrideAccess`.
			access: { create: () => false, update: () => false },
			admin: {
				readOnly: true,
				description:
					'The author deleted their account; the message is re-attributed to the shop owner and shown as "Former member".',
			},
		},
		{
			name: "createdAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
