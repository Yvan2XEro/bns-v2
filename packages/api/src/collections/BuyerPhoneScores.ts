import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { staffOnly } from "../access/staff";

export const BUYER_PHONE_TIERS = [
	"new",
	"regular",
	"trusted",
	"watch",
	"blocked",
] as const;

/**
 * One row per phone, keyed by a keyed hash so the number itself is never
 * stored here — `lib/phoneHash.ts` (Task 4) computes `phoneHash`. There is
 * deliberately no `phone` field: a column added later that stores the raw
 * number would defeat the entire point of hashing it, so its absence is
 * what `order-collections.int.spec.ts` pins.
 */
export const BuyerPhoneScores: CollectionConfig = {
	slug: "buyer-phone-scores",
	admin: {
		useAsTitle: "phoneHash",
		defaultColumns: ["phoneHash", "tier", "ordersPlaced", "ordersDelivered"],
	},
	access: {
		read: staffOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{
			name: "phoneHash",
			type: "text",
			required: true,
			unique: true,
			index: true,
		},
		{ name: "ordersPlaced", type: "number", defaultValue: 0 },
		{ name: "ordersDelivered", type: "number", defaultValue: 0 },
		{
			name: "refusals",
			type: "array",
			fields: [
				{ name: "order", type: "relationship", relationTo: "orders" },
				{
					name: "reason",
					type: "select",
					options: [
						{ label: "Refused", value: "refused" },
						{ label: "Unreachable", value: "unreachable" },
						{ label: "Absent", value: "absent" },
						{ label: "Refused (abuse)", value: "refused_abuse" },
					],
				},
				{ name: "at", type: "date" },
			],
		},
		{ name: "cancelledAfterAccept", type: "number", defaultValue: 0 },
		{
			name: "tier",
			type: "select",
			defaultValue: "new",
			index: true,
			options: BUYER_PHONE_TIERS.map((value) => ({ label: value, value })),
		},
		{
			name: "blockedOverride",
			type: "select",
			defaultValue: "none",
			options: [
				{ label: "None", value: "none" },
				{ label: "Unblocked", value: "unblocked" },
				{ label: "Blocked", value: "blocked" },
			],
			// Staff override, but a *moderator* may not set it — only an admin,
			// from the Payload admin panel. `staffOnly`/`access.update` above
			// already closes REST entirely; this is the extra admin-only door
			// for the one path that still reaches this field.
			access: { update: ({ req }) => isAdmin(req.user) },
		},
	],
	timestamps: true,
};
