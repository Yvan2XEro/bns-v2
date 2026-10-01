import type { CollectionConfig, Where } from "payload";
import { isAdmin, isModerator } from "../access/roles";
import {
	can,
	memberShopIds,
	SHOP_ROLES,
	shopField,
	shopRoleFieldAccess,
} from "../access/shopRoles";

export const SHOP_MEMBER_REVOKE_REASONS = [
	"removed",
	"left",
	"shop_closed",
	"account_deleted",
] as const;

export const INBOX_NOTIFICATION_PREFERENCES = [
	"all",
	"assigned",
	"none",
] as const;

/** Written only by services/shopMembers.ts and services/shops.ts. */
export const ShopMembers: CollectionConfig = {
	slug: "shop-members",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["shop", "user", "role", "status", "joinedAt"],
	},
	access: {
		// A member sees the whole team of every shop where they hold
		// `team.view`, and always their own rows — including rows in a shop
		// that has since gone dormant, so "why can I no longer act here"
		// stays answerable.
		read: async ({ req }) => {
			if (!req.user) return false;
			if (isModerator(req.user as { role?: string })) return true;
			const own = { user: { equals: req.user.id } };
			const shops = await memberShopIds(req, { permission: "team.view" });
			if (shops.length === 0) return own as Where;
			return { or: [own, { shop: { in: shops } }] } as Where;
		},
		create: () => false,
		update: () => false,
		delete: () => false,
		admin: ({ req: { user } }) => isAdmin(user as { role?: string }),
	},
	indexes: [{ fields: ["shop", "user"], unique: true }],
	fields: [
		shopField({ required: true, picker: false }),
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
			index: true,
			options: [
				{ label: "Active", value: "active" },
				{ label: "Revoked", value: "revoked" },
			],
		},
		{
			name: "invitation",
			type: "relationship",
			relationTo: "shop-invitations",
			admin: {
				description:
					"The invitation that created or reactivated this row; empty for the owner.",
			},
		},
		{ name: "joinedAt", type: "date" },
		{ name: "revokedAt", type: "date" },
		{
			name: "revokedBy",
			type: "relationship",
			relationTo: "users",
			// Who removed whom is a moderation-grade fact: the team list shows
			// that someone was removed, not which colleague did it.
			access: { read: ({ req }) => isModerator(req.user as { role?: string }) },
			admin: { description: "Empty for a system revocation." },
		},
		{
			name: "revokedReason",
			type: "select",
			options: SHOP_MEMBER_REVOKE_REASONS.map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "inboxNotifications",
			type: "select",
			required: true,
			defaultValue: "all",
			options: INBOX_NOTIFICATION_PREFERENCES.map((value) => ({
				label: value,
				value,
			})),
			// A manager needs everyone's preference to understand who a buyer
			// message actually reached. A member reading their own preference gets
			// it from `getShopTeam`'s shaped view, which decides per row, not
			// from this field — a field-level predicate has the row's shop but
			// not a cheap way to ask "is this row mine".
			access: {
				read: shopRoleFieldAccess((role) => can(role, "team.inviteStaff")),
			},
		},
	],
	timestamps: true,
};
