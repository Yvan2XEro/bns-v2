import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";

export const Messages: CollectionConfig = {
	slug: "messages",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["conversation", "sender", "content", "createdAt"],
	},
	hooks: {
		afterChange: [
			async ({ doc, operation, req }) => {
				if (operation !== "create") return;
				if (!process.env.NOVU_SECRET_KEY) return;

				try {
					const { triggerNovuEvent } = await import("../hooks/novuEvents");

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
						await triggerNovuEvent({
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
					console.error("[novu] Failed to notify new message:", error);
				}
			},
		],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			return true;
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
