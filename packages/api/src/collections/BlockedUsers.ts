import type { CollectionConfig } from "payload";
import { authenticated } from "@/access/authenticated";

export const BlockedUsers: CollectionConfig = {
	slug: "blocked-users",
	admin: {
		useAsTitle: "blocker",
		defaultColumns: ["blocker", "blocked", "createdAt"],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			return {
				blocker: {
					equals: user.id,
				},
			};
		},
		create: authenticated,
		delete: ({ req: { user } }) => {
			if (!user) return false;
			return {
				blocker: {
					equals: user.id,
				},
			};
		},
		update: () => false,
	},
	hooks: {
		beforeChange: [
			async ({ req, data, operation }) => {
				if (operation === "create") {
					// Set blocker to current user
					data.blocker = req.user?.id;

					// Check for duplicate blocker+blocked pair
					const existing = await (req.payload as any).find({
						collection: "blocked-users",
						where: {
							and: [
								{ blocker: { equals: req.user?.id } },
								{ blocked: { equals: data.blocked } },
							],
						},
						limit: 1,
					});

					if (existing.docs.length > 0) {
						throw new Error("User is already blocked");
					}
				}

				return data;
			},
		],
	},
	fields: [
		{
			name: "blocker",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
		{
			name: "blocked",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
	],
	timestamps: true,
};
