import { APIError, type CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";
import {
	assertNotSuspended,
	type SuspensionCheckable,
} from "../hooks/suspensionGuard";
import { isNotificationProviderConfigured } from "../services/notificationProvider";

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

				// chat-service persists websocket messages under its own service
				// account and names the real sender in the body, so reading
				// req.user here would compare the wrong pair of users below.
				const senderId =
					(typeof data.sender === "string" ? data.sender : data.sender?.id) ??
					req.user?.id;
				if (!senderId) return data;

				const userId = senderId;

				await assertNotSuspended(
					req.payload,
					userId,
					req.user as SuspensionCheckable | null,
				);

				const conversationId =
					typeof data.conversation === "string"
						? data.conversation
						: data.conversation?.id;
				if (!conversationId) return data;

				const conversation = await req.payload.findByID({
					collection: "conversations",
					id: conversationId,
					depth: 0,
					overrideAccess: true,
				});

				const others = (
					(conversation.participants ?? []) as Array<string | { id: string }>
				)
					.map((p) => (typeof p === "string" ? p : p?.id))
					.filter((id): id is string => Boolean(id) && id !== userId);

				if (others.length === 0) return data;

				// Blocking is enforced in both directions: neither party can keep
				// messaging once either side has blocked the other. Without this the
				// mobile "Block" action would be purely cosmetic.
				const blocks = await req.payload.find({
					collection: "blocked-users",
					depth: 0,
					limit: 1,
					overrideAccess: true,
					where: {
						or: [
							{
								and: [
									{ blocker: { equals: userId } },
									{ blocked: { in: others } },
								],
							},
							{
								and: [
									{ blocker: { in: others } },
									{ blocked: { equals: userId } },
								],
							},
						],
					},
				});

				if (blocks.docs.length > 0) {
					throw new APIError(
						"You can no longer exchange messages with this user.",
						403,
					);
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation, req }) => {
				if (operation !== "create") return;
				if (!isNotificationProviderConfigured()) return;

				try {
					const { triggerNotificationEvent } = await import(
						"../hooks/notificationEvents"
					);

					const conversation = await req.payload.findByID({
						collection: "conversations",
						id:
							typeof doc.conversation === "string"
								? doc.conversation
								: doc.conversation?.id,
						depth: 1,
					});

					const senderId =
						typeof doc.sender === "string" ? doc.sender : doc.sender?.id;

					const sender =
						typeof doc.sender === "object" && doc.sender?.name
							? doc.sender
							: await req.payload.findByID({
									collection: "users",
									id: senderId,
								});

					const recipients = (
						conversation.participants as Array<string | { id: string }>
					)
						.map((p) => (typeof p === "string" ? p : p.id))
						.filter((id) => id !== senderId);

					for (const recipientId of recipients) {
						await triggerNotificationEvent({
							event: "new-message",
							subscriberId: recipientId,
							payload: {
								senderName: sender.name,
								messagePreview:
									doc.content.length > 100
										? `${doc.content.slice(0, 100)}...`
										: doc.content,
								conversationId: conversation.id,
							},
						});
					}
				} catch (error) {
					console.error("[notifications] Failed to notify new message:", error);
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

			// Scope reads to conversations the user takes part in. Without this,
			// any signed-in account can read every message in the database.
			const cacheKey = "messageReadConversationIds";
			let ids = req.context?.[cacheKey] as string[] | undefined;

			if (!ids) {
				const conversations = await req.payload.find({
					collection: "conversations",
					where: { participants: { equals: user.id } },
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
			name: "createdAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
