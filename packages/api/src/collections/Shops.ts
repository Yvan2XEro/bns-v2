import type { CollectionConfig, Where } from "payload";
import { isAdmin, isModerator } from "../access/roles";
import { memberShopIds } from "../access/shopRoles";
import { staffOnlyField } from "../access/staff";
import { createShopEndpoint } from "../endpoints/shops";
import {
	assertNotSuspended,
	type SuspensionCheckable,
} from "../hooks/suspensionGuard";
import { ERROR_CODES } from "../lib/errors";
import { CodedAPIError } from "../lib/serviceError";

export const SHOP_SERVICE_CONTEXT = { shopService: true } as const;

/** Fields only services/shops.ts and services/moderation.ts may write. P2 adds its own. */
export const SHOP_SERVICE_FIELDS = [
	"handle",
	"previousHandles",
	"handleChangedAt",
	"owner",
	"status",
	"level",
	"closedAt",
	"suspendedAt",
	"suspendedUntil",
	"suspendedReason",
	"suspendedNote",
	"suspendedBy",
	"publishedListingCount",
] as const;

/** A change to any of these makes the shop's listing documents stale in search. */
const LISTING_VISIBLE_FIELDS = ["name", "handle", "status", "level"] as const;

const SUSPENSION_REASON_OPTIONS = [
	{ label: "Spam", value: "spam" },
	{ label: "Inappropriate content", value: "inappropriate" },
	{ label: "Fraud", value: "fraud" },
	{ label: "Prohibited item", value: "prohibited" },
	{ label: "Harassment", value: "harassment" },
	{ label: "Other", value: "other" },
];

export const Shops: CollectionConfig = {
	slug: "shops",
	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "handle", "owner", "status", "level", "createdAt"],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return { status: { equals: "active" } } as Where;
			if (isModerator(user as { role?: string })) return true;
			return {
				or: [{ status: { equals: "active" } }, { owner: { equals: user.id } }],
			} as Where;
		},
		// Creation goes through POST /api/shops (endpoints/shops.ts).
		create: () => false,
		update: async ({ req }) => {
			if (!req.user) return false;
			if (isAdmin(req.user as { role?: string })) return true;
			return {
				id: { in: await memberShopIds(req, { manage: true }) },
			} as Where;
		},
		// Closed, never deleted: reports and moderation history keep their target.
		delete: () => false,
		admin: ({ req: { user } }) =>
			isModerator(user as { role?: string } | undefined),
	},
	endpoints: [createShopEndpoint],
	hooks: {
		beforeChange: [
			async ({ data, originalDoc, operation, req }) => {
				const isService =
					req.context?.shopService === true ||
					req.context?.moderationAction === true;
				if (operation !== "update" || isService) return data;

				if (req.user) {
					await assertNotSuspended(
						req.payload,
						String(req.user.id),
						req.user as SuspensionCheckable,
					);
				}
				if (
					originalDoc?.status !== "active" &&
					!isAdmin(req.user as { role?: string })
				) {
					throw new CodedAPIError(ERROR_CODES.shopInactive, 409);
				}

				for (const field of SHOP_SERVICE_FIELDS) {
					data[field] = originalDoc?.[field];
				}
				return data;
			},
		],
		afterChange: [
			async ({ doc, previousDoc, operation, req }) => {
				const { queueSearchEvent } = await import("../hooks/searchEvents");
				const reindexListings =
					operation === "update" &&
					LISTING_VISIBLE_FIELDS.some(
						(field) => previousDoc?.[field] !== doc[field],
					);
				await queueSearchEvent(
					req,
					operation === "create" ? "shop.created" : "shop.updated",
					String(doc.id),
					{ reindexListings },
				);
			},
		],
		afterDelete: [
			async ({ doc, req }) => {
				const { queueSearchEvent } = await import("../hooks/searchEvents");
				await queueSearchEvent(req, "shop.deleted", String(doc.id));
			},
		],
	},
	fields: [
		{ name: "handle", type: "text", required: true, unique: true, index: true },
		{
			name: "previousHandles",
			type: "array",
			admin: { readOnly: true },
			fields: [
				{ name: "handle", type: "text", required: true, index: true },
				{ name: "until", type: "date", required: true },
			],
		},
		{ name: "handleChangedAt", type: "date", admin: { readOnly: true } },
		{ name: "name", type: "text", required: true, minLength: 2, maxLength: 60 },
		{ name: "description", type: "textarea", maxLength: 1000 },
		{ name: "logo", type: "upload", relationTo: "media" },
		{ name: "banner", type: "upload", relationTo: "media" },
		{
			name: "contact",
			type: "group",
			fields: [
				{ name: "phone", type: "text", maxLength: 30 },
				{ name: "whatsapp", type: "text", maxLength: 30 },
				{ name: "email", type: "email" },
			],
		},
		{
			name: "location",
			type: "group",
			fields: [
				{ name: "city", type: "text", index: true },
				{ name: "region", type: "text" },
				{ name: "country", type: "text" },
				{ name: "countryCode", type: "text", maxLength: 2 },
			],
		},
		{
			name: "categories",
			type: "relationship",
			relationTo: "categories",
			hasMany: true,
			maxRows: 5,
		},
		{
			name: "owner",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			admin: { readOnly: true },
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "active",
			index: true,
			options: [
				{ label: "Active", value: "active" },
				{ label: "Suspended", value: "suspended" },
				{ label: "Closed", value: "closed" },
			],
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "level",
			type: "number",
			min: 0,
			max: 3,
			defaultValue: 1,
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "closedAt",
			type: "date",
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "suspendedAt",
			type: "date",
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "suspendedUntil",
			type: "date",
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "suspendedReason",
			type: "select",
			options: SUSPENSION_REASON_OPTIONS,
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "suspendedNote",
			type: "textarea",
			access: { read: staffOnlyField },
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "suspendedBy",
			type: "relationship",
			relationTo: "users",
			access: { read: staffOnlyField },
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "publishedListingCount",
			type: "number",
			defaultValue: 0,
			index: true,
			admin: { readOnly: true, position: "sidebar" },
		},
	],
	timestamps: true,
};
