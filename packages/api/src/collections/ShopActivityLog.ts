import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { can, shopField, shopScopedRead } from "../access/shopRoles";

export const SHOP_ACTIVITY_CONTEXT = { shopActivityService: true } as const;

export const SHOP_ACTIVITY_ACTIONS = [
	"member.invited",
	"member.invitation_resent",
	"member.invitation_revoked",
	"member.joined",
	"member.role_changed",
	"member.removed",
	"member.left",
	"member.paused",
	"member.resumed",
	"product.created",
	"product.updated",
	"product.published",
	"product.archived",
	"variant.price_changed",
	"variant.cost_changed",
	"stock.moved",
	"listing.attached",
	"listing.detached",
	"shop.updated",
	"shop.handle_changed",
	"shop.closed",
	"conversation.assigned",
	"conversation.status_changed",
	"verification.submitted",
] as const;

export const SHOP_ACTIVITY_TARGET_TYPES = [
	"shop",
	"member",
	"invitation",
	"product",
	"variant",
	"listing",
	"conversation",
	"verification-request",
] as const;

/**
 * Append-only: every write goes through `recordShopActivity`, in the same
 * transaction as the change it records. `create` is closed to requests
 * including an admin's, so the only way an entry exists is that the change
 * it describes also happened — that is the whole value of the record, and a
 * hand-written entry would destroy it. Moderation actions are not duplicated
 * here; `moderation-log` stays their record.
 */
export const ShopActivityLog: CollectionConfig = {
	slug: "shop-activity-log",
	admin: {
		useAsTitle: "action",
		defaultColumns: ["shop", "action", "actor", "targetType", "createdAt"],
	},
	access: {
		read: shopScopedRead(
			() => false,
			"shop",
			(role) => can(role, "activity.view"),
		),
		create: () => false,
		update: () => false,
		delete: () => false,
		admin: ({ req: { user } }) => isAdmin(user as { role?: string }),
	},
	indexes: [{ fields: ["shop", "createdAt"] }],
	fields: [
		shopField({ required: true, picker: false }),
		{
			name: "actor",
			type: "relationship",
			relationTo: "users",
			index: true,
		},
		{
			name: "actorRole",
			type: "text",
			required: true,
			admin: {
				description:
					"Snapshot at the time of the action: owner, manager, staff or system.",
			},
		},
		{
			name: "action",
			type: "select",
			required: true,
			index: true,
			options: SHOP_ACTIVITY_ACTIONS.map((value) => ({ label: value, value })),
		},
		{
			name: "targetType",
			type: "select",
			required: true,
			options: SHOP_ACTIVITY_TARGET_TYPES.map((value) => ({
				label: value,
				value,
			})),
		},
		{ name: "targetId", type: "text", required: true, index: true },
		{
			name: "metadata",
			type: "json",
			admin: {
				description:
					"Before and after values of the changed fields. Cost values only on variant.cost_changed.",
			},
		},
		{ name: "createdAt", type: "date", admin: { readOnly: true } },
	],
	timestamps: true,
};
