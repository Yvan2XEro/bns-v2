import { APIError, type CollectionConfig, type Where } from "payload";

import { authenticated } from "../access/authenticated";
import { isOwnerOrAdmin } from "../access/isOwnerOrAdmin";
import { validateListingAttributes } from "../hooks/validation";
import { getListingFormPreset } from "../lib/listingFormPreset";
import { isNotificationProviderConfigured } from "../services/notificationProvider";

const LISTING_CONDITIONS = new Set(["new", "like_new", "good", "fair", "poor"]);

/** Maximum number of images a listing can carry. */
const MAX_LISTING_IMAGES = 3;

const getRelationshipId = (value: unknown): string | null => {
	if (typeof value === "string" && value.length > 0) return value;
	if (value && typeof value === "object" && "id" in value) {
		const id = (value as { id?: unknown }).id;
		if (typeof id === "string" && id.length > 0) return id;
	}
	return null;
};

const isEmptyValue = (value: unknown): boolean =>
	value === undefined || value === null || value === "";

const toAttributesRecord = (
	value: unknown,
): Record<string, unknown> | undefined => {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return undefined;
};

const toNormalizedPrice = (value: unknown): number | null => {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : Number.NaN;
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		return Number(trimmed);
	}
	return Number.NaN;
};

const shouldValidateListingForm = ({
	data,
	operation,
	originalDoc,
}: {
	data: Record<string, unknown>;
	operation: "create" | "update";
	originalDoc?: Record<string, unknown> | null;
}): boolean => {
	if (operation === "create" || !originalDoc) return true;

	const nextCategoryId = getRelationshipId(data.category);
	const previousCategoryId = getRelationshipId(originalDoc.category);
	if (nextCategoryId !== previousCategoryId) return true;

	const nextPrice = toNormalizedPrice(data.price);
	const previousPrice = toNormalizedPrice(originalDoc.price);
	if (nextPrice !== previousPrice) return true;

	const nextCondition = isEmptyValue(data.condition) ? null : data.condition;
	const previousCondition = isEmptyValue(originalDoc.condition)
		? null
		: originalDoc.condition;
	if (nextCondition !== previousCondition) return true;

	const nextAttributes = toAttributesRecord(data.attributes) ?? {};
	const previousAttributes = toAttributesRecord(originalDoc.attributes) ?? {};

	return JSON.stringify(nextAttributes) !== JSON.stringify(previousAttributes);
};

export const Listings: CollectionConfig = {
	slug: "listings",
	admin: {
		useAsTitle: "title",
		defaultColumns: [
			"title",
			"price",
			"category",
			"status",
			"seller",
			"createdAt",
		],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) {
				return { status: { equals: "published" } } as Where;
			}
			const u = user as { role?: string };
			if (u.role === "admin" || u.role === "moderator") {
				return true;
			}
			return {
				or: [
					{ status: { equals: "published" } },
					{ seller: { equals: user.id } },
				],
			} as Where;
		},
		create: authenticated,
		update: isOwnerOrAdmin,
		delete: isOwnerOrAdmin,
		admin: ({ req: { user } }) => {
			const userWithRole = user as { role?: string } | undefined;
			return (
				userWithRole?.role === "admin" || userWithRole?.role === "moderator"
			);
		},
	},
	hooks: {
		beforeChange: [
			async ({ data, req, operation, originalDoc }) => {
				// Cap the image count without stranding listings created before the
				// limit existed: reject only when this write would *increase* the
				// count past the maximum. Legacy listings stay editable, their owners
				// can still delete images, and system writes that merely carry the
				// existing array through are unaffected.
				if (Array.isArray(data.images)) {
					const previous = Array.isArray(originalDoc?.images)
						? originalDoc.images.length
						: 0;
					const isGrowing =
						operation === "create" || data.images.length > previous;

					if (data.images.length > MAX_LISTING_IMAGES && isGrowing) {
						throw new APIError(
							`A listing can carry at most ${MAX_LISTING_IMAGES} images.`,
							400,
						);
					}
				}

				// System updates like boosts, view counters or background moderation
				// should not revalidate the whole commercial form. Revalidating legacy
				// listing content here can block unrelated updates such as boostedUntil.
				if (
					shouldValidateListingForm({
						data,
						operation,
						originalDoc: originalDoc as Record<string, unknown> | null,
					})
				) {
					const categoryId = getRelationshipId(data.category);
					if (!categoryId) {
						throw new Error("Category is required");
					}

					const category = await req.payload.findByID({
						collection: "categories",
						id: categoryId,
						depth: 1,
					});
					const formPreset = getListingFormPreset(category);

					if (!formPreset.fields.price.enabled) {
						data.price = null;
					} else {
						const normalizedPrice = toNormalizedPrice(data.price);
						if (
							formPreset.fields.price.required &&
							isEmptyValue(normalizedPrice)
						) {
							throw new Error("Price is required for this category");
						}
						if (normalizedPrice !== null && !Number.isFinite(normalizedPrice)) {
							throw new Error("Price must be a valid number");
						}
						data.price = normalizedPrice;
					}

					if (!formPreset.fields.condition.enabled) {
						data.condition = null;
					} else if (isEmptyValue(data.condition)) {
						data.condition = null;
					} else if (
						typeof data.condition !== "string" ||
						!LISTING_CONDITIONS.has(data.condition)
					) {
						throw new Error("Condition is invalid for this listing");
					}

					const attributeErrors = await validateListingAttributes({
						attributes: toAttributesRecord(data.attributes),
						categoryId,
						payload: req.payload,
					});
					if (attributeErrors.length > 0) {
						throw new Error(
							attributeErrors.map((error) => error.message).join("; "),
						);
					}
				}

				if (operation === "create") {
					data.seller = req.user?.id;
					if (data.status === "published") {
						data.status = "pending";
					}
					// Set expiry date based on duration (default 30 days)
					const durationDays =
						data.duration && [30, 60, 90].includes(Number(data.duration))
							? Number(data.duration)
							: 30;
					const expiresAt = new Date();
					expiresAt.setDate(expiresAt.getDate() + durationDays);
					data.expiresAt = expiresAt.toISOString();
					// Remove duration from data as it's not a persisted field
					data.duration = undefined;
				}

				// Only enforce status restrictions when the status is actually changing.
				// Payload merges the full document into `data` before beforeChange, so
				// system updates (e.g. boostedUntil) would otherwise see the existing
				// "published" status and incorrectly reset it to "pending".
				if (
					operation === "update" &&
					data.status !== undefined &&
					data.status !== originalDoc?.status
				) {
					const u = req.user as { role?: string } | undefined;
					const isAdmin = u?.role === "admin" || u?.role === "moderator";
					if (!isAdmin) {
						// Non-admins can only transition to these statuses
						const userAllowed = ["draft", "pending", "sold"];
						if (!userAllowed.includes(data.status)) {
							// published → pending (re-submit for review); anything else → ignore
							data.status = data.status === "published" ? "pending" : undefined;
						}
					}
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation, previousDoc }) => {
				if (process.env.REDIS_URL) {
					const { publishSearchEvent } = await import("../hooks/searchEvents");
					const event =
						operation === "create" ? "listing.created" : "listing.updated";
					await publishSearchEvent(event, doc.id as string);
				}

				if (!isNotificationProviderConfigured()) return;
				if (operation !== "update") return;
				if (!previousDoc || previousDoc.status === doc.status) return;

				const sellerId =
					typeof doc.seller === "string"
						? doc.seller
						: (doc.seller as { id: string })?.id;
				if (!sellerId) return;

				try {
					const { triggerNotificationEvent } = await import(
						"../hooks/notificationEvents"
					);

					if (doc.status === "rejected" && previousDoc.status !== "rejected") {
						await triggerNotificationEvent({
							event: "listing-rejected",
							subscriberId: sellerId,
							payload: {
								listingId: doc.id,
								listingTitle: doc.title,
								reason: doc.rejectionReason || "No reason provided",
							},
						});
					} else if (
						doc.status === "published" &&
						previousDoc.status !== "published"
					) {
						await triggerNotificationEvent({
							event: "listing-approved",
							subscriberId: sellerId,
							payload: { listingId: doc.id, listingTitle: doc.title },
						});
					} else {
						await triggerNotificationEvent({
							event: "listing-status",
							subscriberId: sellerId,
							payload: {
								listingTitle: doc.title,
								listingId: doc.id,
								oldStatus: previousDoc.status,
								newStatus: doc.status,
							},
						});
					}
				} catch (error) {
					console.error(
						"[notifications] Failed to notify listing status:",
						error,
					);
				}
			},
		],
		afterDelete: [
			async ({ doc }) => {
				if (process.env.REDIS_URL) {
					const { publishSearchEvent } = await import("../hooks/searchEvents");
					await publishSearchEvent("listing.deleted", doc.id as string);
				}
			},
		],
	},
	fields: [
		{
			name: "title",
			type: "text",
			required: true,
			index: true,
		},
		{
			name: "description",
			type: "textarea",
			required: true,
		},
		{
			name: "price",
			type: "number",
			required: false,
			index: true,
		},
		{
			name: "images",
			type: "array",
			// Deliberately no `maxRows`. Field validation runs on every write, and
			// Payload merges the full document into `data`, so a legacy listing with
			// more than MAX_LISTING_IMAGES rows would fail *any* update — including
			// system ones like boost activation and the expiry crons. The limit is
			// enforced in beforeChange instead, which can tell growth from a
			// pre-existing count.
			fields: [
				{
					name: "image",
					type: "upload",
					relationTo: "media",
					required: true,
				},
			],
		},
		{
			name: "location",
			type: "text",
			required: true,
			index: true,
		},
		{
			name: "seller",
			type: "relationship",
			relationTo: "users",
			required: false,
			hasMany: false,
			// admin: {
			// 	readOnly: true,
			// },
		},
		{
			name: "category",
			type: "relationship",
			relationTo: "categories",
			required: true,
			index: true,
		},
		{
			name: "status",
			type: "select",
			options: [
				{ label: "Draft", value: "draft" },
				{ label: "Pending review", value: "pending" },
				{ label: "Published", value: "published" },
				{ label: "Rejected", value: "rejected" },
				{ label: "Sold", value: "sold" },
				{ label: "Expired", value: "expired" },
				{ label: "Deleted", value: "deleted" },
			],
			defaultValue: "draft",
			required: true,
			index: true,
		},
		{
			name: "boostedUntil",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
		{
			name: "expiresAt",
			type: "date",
			admin: {
				readOnly: true,
			},
		},
		{
			name: "views",
			type: "number",
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},
		{
			name: "attributes",
			type: "json",
		},
		{
			name: "coordinates",
			type: "group",
			fields: [
				{ name: "lat", type: "number" },
				{ name: "lng", type: "number" },
			],
		},
		{
			name: "rejectionReason",
			type: "textarea",
			admin: {
				description: "Reason for rejection (visible to seller)",
			},
		},
		{
			name: "condition",
			type: "select",
			options: [
				{ label: "New", value: "new" },
				{ label: "Like New", value: "like_new" },
				{ label: "Good", value: "good" },
				{ label: "Fair", value: "fair" },
				{ label: "Poor", value: "poor" },
			],
		},
		{
			name: "tags",
			type: "relationship",
			// biome-ignore lint/suspicious/noExplicitAny: tags collection not yet in generated types
			relationTo: "tags" as any,
			hasMany: true,
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
