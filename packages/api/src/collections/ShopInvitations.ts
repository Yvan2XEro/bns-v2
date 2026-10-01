import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { can, shopField, shopScopedRead } from "../access/shopRoles";

export const SHOP_INVITATION_CONTEXT = { shopMemberService: true } as const;

export const INVITATION_STATUSES = [
	"pending",
	"accepted",
	"declined",
	"revoked",
	"expired",
] as const;

const requiredFor =
	(channel: "phone" | "email", label: string) =>
	(value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) =>
		siblingData.channel === channel &&
		(typeof value !== "string" || value === "")
			? `${label} is required for a ${channel} invitation.`
			: true;

/** Written only by services/shopMembers.ts (Task 9). */
export const ShopInvitations: CollectionConfig = {
	slug: "shop-invitations",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["shop", "role", "channel", "status", "expiresAt"],
	},
	access: {
		read: shopScopedRead(
			() => false,
			"shop",
			(role) => can(role, "team.view"),
		),
		create: () => false,
		update: () => false,
		delete: () => false,
		admin: ({ req: { user } }) => isAdmin(user as { role?: string }),
	},
	fields: [
		shopField({ required: true, picker: false }),
		{
			name: "role",
			type: "select",
			required: true,
			options: [
				{ label: "Manager", value: "manager" },
				{ label: "Staff", value: "staff" },
			],
		},
		{
			name: "channel",
			type: "select",
			required: true,
			options: [
				{ label: "Phone", value: "phone" },
				{ label: "Email", value: "email" },
			],
		},
		{
			name: "phone",
			type: "text",
			index: true,
			validate: requiredFor("phone", "A phone number"),
		},
		{
			name: "email",
			type: "text",
			index: true,
			validate: requiredFor("email", "An email address"),
		},
		{
			// `{shopId}:{channel}:{target}`, carried by the partial unique index
			// the migration builds, so two racing invites to the same person
			// cannot both become pending.
			name: "pendingKey",
			type: "text",
			index: true,
		},
		{
			name: "tokenHash",
			type: "text",
			required: true,
			unique: true,
			// Never leaves the database: the raw token is only in the link, and
			// its hash is enough to guess nothing but still enough to confirm a
			// guess if it were readable.
			access: { read: () => false },
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "pending",
			index: true,
			options: INVITATION_STATUSES.map((value) => ({ label: value, value })),
		},
		{
			name: "invitedBy",
			type: "relationship",
			relationTo: "users",
			required: true,
		},
		{ name: "expiresAt", type: "date", required: true, index: true },
		{
			name: "sendCount",
			type: "number",
			required: true,
			defaultValue: 1,
			min: 0,
		},
		{ name: "lastSentAt", type: "date" },
		{ name: "acceptedBy", type: "relationship", relationTo: "users" },
		{ name: "respondedAt", type: "date" },
	],
	timestamps: true,
};
