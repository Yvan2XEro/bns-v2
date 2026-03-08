import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";

export const Messages: CollectionConfig = {
	slug: "messages",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["conversation", "sender", "content", "createdAt"],
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
