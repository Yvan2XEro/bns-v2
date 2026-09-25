import type { CollectionConfig } from "payload";
import { isAdmin, isModerator } from "../access/roles";
import { SHOP_ROLES } from "../access/shopRoles";

/** Written only by services/shops.ts; P1 creates owner rows only. */
export const ShopMembers: CollectionConfig = {
	slug: "shop-members",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["shop", "user", "role", "status", "createdAt"],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			if (isModerator(user as { role?: string })) return true;
			return { user: { equals: user.id } };
		},
		create: () => false,
		update: () => false,
		delete: () => false,
		admin: ({ req: { user } }) => isAdmin(user as { role?: string }),
	},
	indexes: [{ fields: ["shop", "user"], unique: true }],
	fields: [
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
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
		{
			name: "role",
			type: "select",
			required: true,
			options: SHOP_ROLES.map((value) => ({ label: value, value })),
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "active",
			options: [
				{ label: "Active", value: "active" },
				{ label: "Revoked", value: "revoked" },
			],
		},
	],
	timestamps: true,
};
