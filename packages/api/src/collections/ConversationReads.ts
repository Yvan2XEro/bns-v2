import type { CollectionConfig, Where } from "payload";
import { isAdmin, isModerator } from "../access/roles";

/**
 * One row per (conversation, member). A member's unread count is the number
 * of messages in the conversation with `createdAt > lastReadAt` and a sender
 * other than them — derived at read time, so it cannot drift the way a stored
 * counter does.
 *
 * `messages.read` keeps its old meaning alongside this, for the other side:
 * a buyer message becomes `read` when any member reads it, and a shop message
 * when the buyer does. Released clients showing read receipts keep working.
 */
export const ConversationReads: CollectionConfig = {
	slug: "conversation-reads",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["conversation", "user", "lastReadAt"],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			if (isModerator(user as { role?: string })) return true;
			return { user: { equals: user.id } } as Where;
		},
		create: () => false,
		update: () => false,
		delete: () => false,
		admin: ({ req: { user } }) => isAdmin(user as { role?: string }),
	},
	indexes: [{ fields: ["conversation", "user"], unique: true }],
	fields: [
		{
			name: "conversation",
			type: "relationship",
			relationTo: "conversations",
			required: true,
			index: true,
		},
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
		{ name: "lastReadAt", type: "date" },
		{ name: "lastReadMessage", type: "relationship", relationTo: "messages" },
	],
	timestamps: true,
};
