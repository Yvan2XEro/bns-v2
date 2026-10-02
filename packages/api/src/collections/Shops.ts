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
import { shopCapabilities } from "../lib/shopCapabilities";
import { BUSINESS_TYPES } from "./VerificationRequests";

export const SHOP_SERVICE_CONTEXT = { shopService: true } as const;

/** Fields only services/shops.ts and services/moderation.ts may write. P2 adds its own. */
export const SHOP_SERVICE_FIELDS = [
	"handle",
	"previousHandles",
	"handleChangedAt",
	"owner",
	"status",
	"level",
	"levelExpiresAt",
	"verifiedAt",
	"closedAt",
	"suspendedAt",
	"suspendedUntil",
	"suspendedReason",
	"suspendedNote",
	"suspendedBy",
	"suspensionLogId",
	"publishedListingCount",
	"notifiedExpiryDays",
	"ordersRestrictedAt",
	"ordersRestrictedReason",
	"rating",
	"totalReviews",
	"stats",
] as const;

/** A change to any of these makes the shop's listing documents stale in search. */
/**
 * A change to any of these alters what a listing of this shop looks like in
 * the search index, so it has to trigger a reindex of the shop's listings.
 *
 * The last three arrived with P4's `orderable` flag, which reads
 * `ordersRestrictedAt`, `orderSettings.codEnabled` and `location.city`.
 * Leaving them out is the P3 `levelExpiresAt` bug in another costume: the
 * index would answer from a stale copy while the database answered correctly,
 * so the same listing would look orderable in search and refuse at checkout.
 *
 * Dotted paths on purpose. `location` and `orderSettings` are groups, and
 * comparing a group by reference is never equal — listing the group itself
 * would reindex every listing on every shop save.
 */
const LISTING_VISIBLE_FIELDS = [
	"name",
	"handle",
	"status",
	"level",
	"levelExpiresAt",
	"ordersRestrictedAt",
	"orderSettings.codEnabled",
	"location.city",
] as const;

function at(doc: Record<string, unknown> | undefined, path: string): unknown {
	let cursor: unknown = doc;
	for (const key of path.split(".")) {
		if (cursor === null || typeof cursor !== "object") return undefined;
		cursor = (cursor as Record<string, unknown>)[key];
	}
	return cursor;
}

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
				id: { in: await memberShopIds(req, { permission: "settings.edit" }) },
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

				// `legal` is owner-editable while the shop is below level 3 and is
				// shown as "declared". Once level 3 is effective it is reviewed
				// content: changing it needs a new level-3 request. Gated on the
				// *effective* level — the same figure `legalVerified` in
				// publicShop.ts is built from — not the raw stored `level`: once
				// `levelExpiresAt` has passed, a buyer is no longer shown this shop
				// as level-3 verified, so locking the seller out on the stale raw
				// level let a PATCH return 200 while silently discarding the edit.
				const legalStillVerified = originalDoc
					? shopCapabilities({
							status:
								typeof originalDoc.status === "string"
									? originalDoc.status
									: "active",
							level:
								typeof originalDoc.level === "number"
									? originalDoc.level
									: null,
							levelExpiresAt: originalDoc.levelExpiresAt ?? null,
						}).legalInfoVerified
					: false;
				if (legalStillVerified) {
					data.legal = originalDoc?.legal;
				} else if (data.legal && typeof data.legal === "object") {
					(data.legal as Record<string, unknown>).verifiedAt =
						(originalDoc?.legal as { verifiedAt?: unknown } | undefined)
							?.verifiedAt ?? null;
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
						(field) => at(previousDoc, field) !== at(doc, field),
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
			name: "levelExpiresAt",
			type: "date",
			index: true,
			admin: {
				readOnly: true,
				position: "sidebar",
				description:
					"Earliest expiry among the requests backing the current level. Read through shopCapabilities, which compares it at read time — never trust a job to have lowered `level` already.",
			},
		},
		{
			name: "verifiedAt",
			type: "date",
			admin: {
				readOnly: true,
				position: "sidebar",
				description: "When level 2 was first reached.",
			},
		},
		{
			name: "notifiedExpiryDays",
			type: "number",
			admin: {
				readOnly: true,
				position: "sidebar",
				description:
					"The expiry-notice threshold (30 or 7 days) last sent for the current levelExpiresAt, so the nightly purge fires each one once. Written only by jobs/purgeVerificationData.ts through writeShop.",
			},
		},
		{
			/**
			 * Declared by the shop until level 3, reviewed at level 3. The whole
			 * group is public: it is what a buyer needs to know who they are
			 * dealing with, labelled "declared" until `verifiedAt` is set.
			 */
			name: "legal",
			type: "group",
			fields: [
				{
					name: "businessType",
					type: "select",
					options: BUSINESS_TYPES.map((value) => ({ label: value, value })),
				},
				{ name: "legalName", type: "text", maxLength: 120 },
				{ name: "rccmNumber", type: "text", maxLength: 40 },
				{ name: "niu", type: "text", maxLength: 14 },
				{ name: "verifiedAt", type: "date", admin: { readOnly: true } },
			],
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
			// The `moderation-log` entry that produced the current suspension —
			// millisecond timestamps can tie under a frozen clock or fast
			// concurrent writes, an id cannot. Every restore path (direct
			// unsuspend, the user cascade, the expiry job) matches on this
			// instead of `suspendedAt` before touching anything.
			name: "suspensionLogId",
			type: "text",
			index: true,
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
		{
			// Owner/manager-editable through the same `settings.edit` gate as the
			// rest of the collection's `access.update` — no extra field access
			// needed here.
			name: "orderSettings",
			type: "group",
			fields: [
				{ name: "codEnabled", type: "checkbox", defaultValue: false },
				{ name: "sellerDeliveryEnabled", type: "checkbox", defaultValue: true },
				{ name: "deliveryFee", type: "number", min: 0, max: 20_000 },
				{ name: "deliveryEtaText", type: "text" },
				{ name: "pickupEnabled", type: "checkbox", defaultValue: false },
				{
					name: "pickupPoint",
					type: "group",
					fields: [
						{ name: "address", type: "text" },
						{ name: "landmark", type: "text" },
						{
							name: "gps",
							type: "group",
							fields: [
								{ name: "lat", type: "number" },
								{ name: "lng", type: "number" },
							],
						},
						{ name: "hours", type: "text" },
					],
				},
				{ name: "salesTermsExtra", type: "textarea", maxLength: 2000 },
			],
		},
		{
			name: "ordersRestrictedAt",
			type: "date",
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "ordersRestrictedReason",
			type: "select",
			options: [
				{ label: "Commission overdue", value: "commission_overdue" },
				{ label: "Staff", value: "staff" },
			],
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "rating",
			type: "number",
			min: 0,
			max: 5,
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "totalReviews",
			type: "number",
			defaultValue: 0,
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "stats",
			type: "group",
			admin: { readOnly: true },
			fields: [
				{ name: "ordersDelivered", type: "number", defaultValue: 0 },
				{ name: "ordersCancelledBySeller", type: "number", defaultValue: 0 },
				{ name: "ordersAutoCancelled", type: "number", defaultValue: 0 },
				{ name: "ordersDeliveryFailed", type: "number", defaultValue: 0 },
			],
		},
	],
	timestamps: true,
};
