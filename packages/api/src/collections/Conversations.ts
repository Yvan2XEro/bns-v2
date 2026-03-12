import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";

export const Conversations: CollectionConfig = {
	slug: "conversations",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["participants", "listing", "updatedAt"],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			return {
				participants: {
					equals: user.id,
				},
			};
		},
		create: authenticated,
		update: ({ req: { user } }) => {
			if (!user) return false;
			return {
				participants: {
					equals: user.id,
				},
			};
		},
		delete: ({ req: { user } }) => {
			if (!user) return false;
			const userWithRole = user as { role?: string };
			if (userWithRole.role === "admin") return true;
			return {
				participants: {
					equals: user.id,
				},
			};
		},
	},
	fields: [
		{
			name: "participants",
			type: "relationship",
			relationTo: "users",
			hasMany: true,
			required: true,
		},
		{
			name: "listing",
			type: "relationship",
			relationTo: "listings",
			required: false,
		},
		{
			name: "lastMessage",
			type: "relationship",
			relationTo: "messages",
			required: false,
		},
		{
			name: "updatedAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
