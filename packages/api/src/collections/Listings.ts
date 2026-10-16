import type { Payload, PayloadRequest } from "payload";
import {
	APIError,
	type CollectionConfig,
	ValidationError,
	type Where,
} from "payload";

import { authenticated } from "../access/authenticated";
import { isOwnerOrAdmin } from "../access/isOwnerOrAdmin";
import { resolveShopRole, shopField } from "../access/shopRoles";
import { staffOnlyField } from "../access/staff";
import {
	keepApplicableTags,
	listingTagIssues,
	relationIds,
} from "../contracts/listingTags";
import {
	listingPriceIssue,
	normalizeListingPrice,
} from "../contracts/listingValidation";
import { photoLimitIssue } from "../contracts/photoLimit";
import { queueShopRecount } from "../hooks/shopListingCount";
import {
	assertNotSuspended,
	type SuspensionCheckable,
} from "../hooks/suspensionGuard";
import { validateListingAttributes } from "../hooks/validation";
import { tagsForCategory } from "../lib/categoryTags";
import { getDeliverySettings } from "../lib/deliverySettings";
import { ERROR_CODES } from "../lib/errors";
import { getListingFormPreset } from "../lib/listingFormPreset";
import { getPhotosIncluded } from "../lib/mediaSettings";
import {
	type IsListingOrderableInput,
	isListingOrderable,
	type OrderableProduct,
	type OrderableShop,
} from "../lib/orderable";
import { getOrderSettings } from "../lib/orderSettings";
import { relationId } from "../lib/relationId";
import { CodedAPIError } from "../lib/serviceError";
import { isNotificationProviderConfigured } from "../services/notificationProvider";
import { recordShopActivity } from "../services/shopActivity";

/** A refusal Payload answers with `errors[0].data.errors[].path`, which both clients map onto their fields. */
function fieldError(path: string, message: string): ValidationError {
	return new ValidationError({
		collection: "listings",
		errors: [{ path, message }],
	});
}

/**
 * A ValidationError on `images` that also carries `media.photoLimit` and the
 * limit, so a client can both pin it to the photos and name the code.
 */
function photoLimitError(max: number): ValidationError {
	const error = fieldError(
		"images",
		`A listing can carry at most ${max} photos.`,
	);
	const errors = error.data.errors.map((entry) => ({
		...entry,
		rule: "photoLimit",
		params: { max },
	}));
	Object.assign(error, {
		data: { ...error.data, errors, code: ERROR_CODES.photoLimit, limit: max },
	});
	return error;
}

/**
 * Set by services/accountDeletion.ts on the deletes its cascade makes. It is
 * the one way past the `beforeDelete` guard below, and it is unforgeable from
 * outside the server: Payload builds `req.context` only from a local API
 * `context` option (`utilities/createLocalReq.js`) — nothing in it reads a
 * `context` key out of a request body or query string.
 */
export const ACCOUNT_DELETION_CONTEXT = { accountDeletion: true } as const;

/** Owned by services/products.ts on a product listing; pinned against every other writer. */
export const PRODUCT_DERIVED_FIELDS = [
	"title",
	"description",
	"images",
	"price",
	"category",
	"attributes",
	"location",
	"status",
	"expiresAt",
	"shop",
	"product",
	"productSummary",
	"moderationHold",
] as const;

const toAttributesRecord = (
	value: unknown,
): Record<string, unknown> | undefined => {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return undefined;
};

const toNormalizedPrice = normalizeListingPrice;

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

	const nextCategoryId = relationId(data.category);
	const previousCategoryId = relationId(originalDoc.category);
	if (nextCategoryId !== previousCategoryId) return true;

	const nextPrice = toNormalizedPrice(data.price);
	const previousPrice = toNormalizedPrice(originalDoc.price);
	if (nextPrice !== previousPrice) return true;

	const nextAttributes = toAttributesRecord(data.attributes) ?? {};
	const previousAttributes = toAttributesRecord(originalDoc.attributes) ?? {};

	return JSON.stringify(nextAttributes) !== JSON.stringify(previousAttributes);
};

/**
 * Product-backed listings use a raw-driver partial unique index on `(shop,
 * product)`. Supplier listings and reseller listings share a product reference
 * but each shop may publish it once; non-product listings are excluded.
 */

/**
 * Gathers what `isListingOrderable` (lib/orderable.ts) needs and asks it the
 * one question. A fresh shop/product read on every listing read, never a
 * trust of whatever depth populated on `doc` — the same reason
 * `assertCheckoutPreconditions` re-fetches the shop by id instead of reading
 * it off the cart. `productSummary.available` is read as-is rather than
 * recomputed: it is already `isProductAvailable`'s own result, written by
 * `deriveListingData` whenever the product or its variants change.
 */
async function deriveOrderable(
	payload: Payload,
	req: PayloadRequest,
	doc: Record<string, unknown>,
): Promise<boolean> {
	const shopId = relationId(doc.shop);
	if (!shopId) return false;

	const settings = await getOrderSettings(payload);
	const shop = await payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const deliverySettings = await getDeliverySettings(payload);
	const deliveryOptionAvailable = deliverySettings.zonesEnabled
		? await activeDeliveryOptionAvailable(payload, req.context, shopId, {
				intercityEnabled: deliverySettings.intercityEnabled,
			})
		: undefined;

	const productId = relationId(doc.product);
	const product = productId
		? await payload
				.findByID({
					collection: "products",
					id: productId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: null;

	const summary = doc.productSummary as
		| { available?: unknown }
		| null
		| undefined;
	const productAvailable =
		typeof summary?.available === "boolean" ? summary.available : null;

	const input: IsListingOrderableInput = {
		listingStatus: typeof doc.status === "string" ? doc.status : null,
		shopId,
		shop: shop as OrderableShop | null,
		product: product as OrderableProduct | null,
		productAvailable,
		deliveryOptionAvailable,
		settings,
	};
	return isListingOrderable(input);
}

async function activeDeliveryOptionAvailable(
	payload: Payload,
	context: Record<string, unknown> | undefined,
	shopId: string,
	options: { intercityEnabled: boolean },
): Promise<boolean> {
	const cacheValue = context?.p7ActiveDeliveryOptions;
	const cache = isRecord(cacheValue) ? cacheValue : {};
	const cached = cache[shopId];
	if (typeof cached === "boolean") return cached;

	const zones = await payload.count({
		collection: "delivery-zones",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ active: { equals: true } },
				{ codAllowed: { equals: true } },
				...(options.intercityEnabled
					? []
					: [{ scope: { equals: "same_city" } }]),
			],
		},
		overrideAccess: true,
	});
	const locations = await payload.count({
		collection: "shop-locations",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ active: { equals: true } },
				{ pickupEnabled: { equals: true } },
			],
		},
		overrideAccess: true,
	});
	const available = zones.totalDocs + locations.totalDocs > 0;
	if (context)
		context.p7ActiveDeliveryOptions = { ...cache, [shopId]: available };
	return available;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
		// Computed before field access runs, the same shape `Users.beforeRead`
		// already uses for `phoneVerified`/`verified`: never stored, so there is
		// nothing for a stale write to leave behind.
		beforeRead: [
			async ({ doc, req }) => {
				doc.orderable = await deriveOrderable(req.payload, req, doc);
				return doc;
			},
		],
		beforeChange: [
			async ({ data, req, operation, originalDoc }) => {
				if (req.context?.statsService !== true) {
					data.views =
						originalDoc?.views ?? (operation === "create" ? 0 : undefined);
				}
				// Skipped for moderation writes: suspending an account cascades
				// onto its listings, and that cascade must not be blocked by the
				// suspension it is applying.
				if (req.user && req.context?.moderationAction !== true) {
					await assertNotSuspended(
						req.payload,
						String(req.user.id),
						req.user as SuspensionCheckable,
					);
				}

				const productService = req.context?.productService === true;
				const moderationWrite = req.context?.moderationAction === true;
				const resaleService = req.context?.resaleService === true;

				if (!resaleService && !moderationWrite) {
					data.resale = originalDoc?.resale ?? null;
				}

				if (!productService) {
					if (relationId(originalDoc?.product) && !moderationWrite) {
						for (const field of PRODUCT_DERIVED_FIELDS) {
							data[field] = originalDoc?.[field];
						}
					} else {
						data.product = originalDoc?.product ?? null;
						data.productSummary = originalDoc?.productSummary ?? null;
						// A listing that lost its product (detach, or the closeShop
						// cascade that detaches every listing) still carries whatever
						// moderation hold it had — `moderationHold` is moderation-owned
						// in every branch, not just the product-linked one above, and a
						// held listing's `status` stays pinned too. Without this, the
						// PRODUCT_DERIVED_FIELDS pin above stops applying the moment
						// `product` goes null, and the seller who just detached (or
						// whose shop just closed) can PATCH `status`/`moderationHold`
						// directly and undo the moderator's decision in one call, with
						// nothing written to the log.
						if (!moderationWrite) {
							data.moderationHold = originalDoc?.moderationHold ?? false;
							if (originalDoc?.moderationHold === true) {
								data.status = originalDoc?.status;
							}
						}
					}
				}

				const nextShop = relationId(data.shop);
				if (
					nextShop &&
					nextShop !== relationId(originalDoc?.shop) &&
					!moderationWrite &&
					!productService
				) {
					const role = req.user
						? await resolveShopRole(
								req.payload,
								String(req.user.id),
								nextShop,
								req.context,
							)
						: null;
					if (!role) throw new CodedAPIError(ERROR_CODES.shopNotMember, 403);
					const shop = await req.payload
						.findByID({
							collection: "shops",
							id: nextShop,
							depth: 0,
							overrideAccess: true,
							req,
						})
						.catch(() => null);
					if (shop?.status !== "active") {
						throw new CodedAPIError(ERROR_CODES.shopInactive, 409);
					}
				}

				const nextProduct = relationId(data.product);
				if (nextProduct && nextProduct !== relationId(originalDoc?.product)) {
					const product = await req.payload
						.findByID({
							collection: "products",
							id: nextProduct,
							depth: 0,
							overrideAccess: true,
							req,
						})
						.catch(() => null);
					if (!product) {
						throw new APIError("The product does not exist.", 400);
					}
					if (!nextShop) {
						throw new APIError(
							"A listing that carries a product must belong to a shop.",
							400,
						);
					}
					if (
						relationId(product.shop) !== nextShop &&
						req.context?.resaleService !== true
					) {
						throw new APIError(
							"A listing cannot carry a product from another shop.",
							400,
						);
					}
				}

				const isProductListing = productService || Boolean(nextProduct);

				// Cap the photo count (the admin's `media.photosIncluded`) without
				// stranding listings saved before the limit existed or before it was
				// lowered: reject only when this write would *increase* the count
				// past it. Legacy listings stay editable, their owners can still
				// delete photos, and system writes that merely carry the existing
				// array through never read the setting.
				if (Array.isArray(data.images) && !isProductListing) {
					const count = data.images.length;
					const previous =
						operation === "create"
							? null
							: Array.isArray(originalDoc?.images)
								? originalDoc.images.length
								: 0;
					if (count > 1 && (previous === null || count > previous)) {
						const issue = photoLimitIssue(
							count,
							previous,
							await getPhotosIncluded(req.payload),
						);
						if (issue) throw photoLimitError(Number(issue.params?.max));
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
					const categoryId = relationId(data.category);
					if (!categoryId) {
						throw fieldError("category", "Category is required");
					}

					// `depth` decides how much of the parent chain comes back
					// populated, and the form preset is inherited from ancestors, so
					// anything shallower than the tree silently loses the inherited
					// setting. `depth: 1` only populated the immediate parent, which
					// covers today's two-level tree but breaks the moment a
					// sub-sub-category is added in the admin. Two levels of headroom
					// costs one extra lookup on a code path that already hits the
					// database.
					const category = await req.payload.findByID({
						collection: "categories",
						id: categoryId,
						depth: 3,
					});
					const formPreset = getListingFormPreset(category);

					if (!formPreset.fields.price.enabled) {
						data.price = null;
					} else {
						const priceIssue = listingPriceIssue(
							formPreset.fields.price,
							data.price,
						);
						if (priceIssue) {
							throw fieldError(
								"price",
								priceIssue.rule === "required"
									? "Price is required for this category"
									: "Price must be a valid number",
							);
						}
						data.price = toNormalizedPrice(data.price);
					}

					const attributeErrors = await validateListingAttributes({
						attributes: toAttributesRecord(data.attributes),
						categoryId,
						payload: req.payload,
					});
					if (attributeErrors.length > 0) {
						throw new ValidationError({
							collection: "listings",
							errors: attributeErrors.map((error) => ({
								path: error.field ? `attributes.${error.field}` : "attributes",
								message: error.message,
							})),
						});
					}
				}

				const selectedTags = relationIds(data.tags);
				const tagsTouched =
					operation === "create" ||
					relationId(data.category) !== relationId(originalDoc?.category) ||
					selectedTags.join() !== relationIds(originalDoc?.tags).join();
				if (tagsTouched && selectedTags.length > 0) {
					const categoryId = relationId(data.category);
					const applicable = categoryId
						? (await tagsForCategory(req.payload, categoryId, req)).map((tag) =>
								String(tag.id),
							)
						: [];
					if (listingTagIssues(selectedTags, applicable).length > 0) {
						// The product service re-files a listing when its product moves
						// category, and nobody is there to pick tags again: the ones that
						// stopped applying go. A seller's own write is refused instead,
						// so the form can say which field to fix.
						if (productService || moderationWrite) {
							data.tags = keepApplicableTags(selectedTags, applicable);
						} else {
							throw fieldError(
								"tags",
								"A tag does not apply to this listing's category",
							);
						}
					}
				}

				if (operation === "create") {
					const listingShopId = relationId(data.shop);
					if (listingShopId) {
						// A shop listing belongs to the shop, so its public seller is
						// the owner: the contact-phone reveal and the seller card must
						// never expose a staff member's personal account, and removing
						// a member must not orphan what they published. The acting
						// member is recorded in `shop-activity-log` instead.
						const listingShop = await req.payload
							.findByID({
								collection: "shops",
								id: listingShopId,
								depth: 0,
								overrideAccess: true,
								req,
							})
							.catch(() => null);
						const ownerId = relationId(listingShop?.owner);
						data.seller = resaleService
							? req.user?.id
							: (ownerId ?? req.user?.id);

						const actorId = req.user ? String(req.user.id) : null;
						if (actorId) {
							const actorRole = await resolveShopRole(
								req.payload,
								actorId,
								listingShopId,
								req.context,
							);
							await recordShopActivity(req, {
								shop: listingShopId,
								actor: actorId,
								actorRole: actorRole ?? "owner",
								action: "product.published",
								targetType: "listing",
								// The listing id does not exist yet in `beforeChange`;
								// the product is the stable handle for a shop listing,
								// which always has one.
								targetId: String(relationId(data.product) ?? listingShopId),
								metadata: { title: data.title ?? null },
							});
						}
					} else {
						data.seller = req.user?.id;
					}
					if (productService) {
						// Product listings mirror their product and never expire.
						data.expiresAt = null;
						data.duration = undefined;
					} else {
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
				}

				// Only enforce status restrictions when the status is actually changing.
				// Payload merges the full document into `data` before beforeChange, so
				// system updates (e.g. boostedUntil) would otherwise see the existing
				// "published" status and incorrectly reset it to "pending".
				if (
					operation === "update" &&
					!productService &&
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
			async ({ doc, operation, previousDoc, req }) => {
				if (process.env.REDIS_URL) {
					const { queueSearchEvent } = await import("../hooks/searchEvents");
					const event =
						operation === "create" ? "listing.created" : "listing.updated";
					await queueSearchEvent(req, event, doc.id as string);
				}

				const previousShop = relationId(previousDoc?.shop);
				const currentShop = relationId(doc.shop);
				if (
					operation === "create" ||
					previousDoc?.status !== doc.status ||
					previousShop !== currentShop
				) {
					for (const shopId of new Set([previousShop, currentShop])) {
						if (shopId) await queueShopRecount(req, shopId);
					}
				}

				// Product publication is the seller's own action, not a moderation decision.
				if (req.context?.productService === true) return;

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
		beforeDelete: [
			async ({ id, req }) => {
				const listing = await req.payload
					.findByID({
						collection: "listings",
						id,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null);
				if (!relationId(listing?.product)) return;
				// The account-deletion cascade deletes every listing the departing
				// user sells, and a product listing's seller is the shopkeeper, so
				// without this branch the guard below would block them from ever
				// closing their account. The account is going: there is no product
				// lifecycle left to defer to.
				if (req.context?.accountDeletion === true) return;
				// The product owns its listing's lifecycle. Without this, a seller
				// deletes their own rejected listing — `delete` is owner-or-admin and
				// the seller of a product listing is the shopkeeper — the product's
				// pointer dangles, and the next product edit republishes it as if the
				// moderator had never ruled. Unpublishing goes through the product's
				// status, which `listingStatusFor` keeps subordinate to a rejection.
				// Moderators are refused too: moderation moves the status, it does
				// not delete rows.
				throw new APIError(
					"A product's listing is unpublished through its product, not deleted.",
					403,
				);
			},
		],
		afterDelete: [
			async ({ doc, req }) => {
				if (process.env.REDIS_URL) {
					const { queueSearchEvent } = await import("../hooks/searchEvents");
					await queueSearchEvent(req, "listing.deleted", doc.id as string);
				}

				const shopId = relationId(doc.shop);
				if (shopId) await queueShopRecount(req, shopId);
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
			// more photos than the admin's limit would fail *any* update — including
			// system ones like boost activation and the expiry crons. The limit is
			// enforced in beforeChange instead, which can tell growth from a
			// pre-existing count.
			//
			// For the same reason there is no *minimum* either, and beforeChange
			// deliberately does not enforce the category's `photos` rule the way it
			// enforces `price`:
			//   • "photos: required" would strand every listing that predates the
			//     rule. A price can be typed into the form that is
			//     failing; a missing photo on a listing whose category was
			//     re-typed later blocks writes that never touched the images.
			//   • "photos: hidden" would mean clearing `data.images` the way a
			//     hidden price is nulled — silently deleting uploaded media on an
			//     unrelated edit. Hiding a field must not destroy data, and a job
			//     offer that carries a company logo harms nobody.
			//   • Nothing downstream breaks on a photoless listing (cards already
			//     render a placeholder), so the rule is about what the *form* asks
			//     for, not about data integrity. It is served to clients through
			//     `category.formPreset` and enforced there; moderation remains the
			//     human gate on ad quality.
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
			type: "row",
			fields: [
				{
					name: "location",
					type: "text",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
				{
					name: "seller",
					type: "relationship",
					relationTo: "users",
					required: false,
					hasMany: false,
					admin: { width: "50%" },
					// admin: {
					// 	readOnly: true,
					// },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "category",
					type: "relationship",
					relationTo: "categories",
					required: true,
					index: true,
					admin: { width: "50%" },
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
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "boostedUntil",
					type: "date",
					admin: { width: "33%", readOnly: true },
				},
				{
					name: "expiresAt",
					type: "date",
					admin: { width: "33%", readOnly: true },
				},
				{
					name: "views",
					type: "number",
					defaultValue: 0,
					admin: { width: "33%", readOnly: true },
				},
			],
		},
		{
			name: "attributes",
			type: "json",
		},
		{
			name: "coordinates",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{ name: "lat", type: "number", admin: { width: "50%" } },
						{ name: "lng", type: "number", admin: { width: "50%" } },
					],
				},
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
			name: "tags",
			type: "relationship",
			relationTo: "tags",
			hasMany: true,
		},
		shopField({ picker: false }),
		{
			name: "product",
			type: "relationship",
			relationTo: "products",
			index: true,
			admin: { readOnly: true },
		},
		{
			name: "productSummary",
			type: "group",
			admin: {
				readOnly: true,
				description:
					"Derived from the product's variants by the product service.",
			},
			fields: [
				{
					type: "row",
					fields: [
						{ name: "priceMin", type: "number", admin: { width: "50%" } },
						{ name: "priceMax", type: "number", admin: { width: "50%" } },
					],
				},
				{
					name: "available",
					type: "checkbox",
					admin: {
						description:
							"Buyer-safe purchasability signal, not a unit count — the exact aggregate stays on the privileged catalogue view only.",
					},
				},
				{
					type: "row",
					fields: [
						{ name: "variantCount", type: "number", admin: { width: "50%" } },
						{
							name: "trackInventory",
							type: "checkbox",
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			name: "resale",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "supplierShop",
							type: "relationship",
							relationTo: "shops",
							admin: { width: "50%", readOnly: true },
						},
						{
							name: "link",
							type: "relationship",
							relationTo: "resale-links",
							admin: { width: "50%", readOnly: true },
						},
					],
				},
				{
					name: "prices",
					type: "array",
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "variant",
									type: "relationship",
									relationTo: "product-variants",
									required: true,
									admin: { width: "50%" },
								},
								{
									name: "price",
									type: "number",
									required: true,
									min: 1,
									admin: { width: "50%" },
								},
							],
						},
					],
				},
				{
					name: "desiredStatus",
					type: "select",
					// Not required: listings born before P8 store null here, and a
					// product update re-validates the whole doc — a non-resale
					// listing must not fail on a resale field. Consumers compare
					// === "published", so null reads as draft.
					defaultValue: "draft",
					options: ["published", "draft"].map((value) => ({
						label: value,
						value,
					})),
				},
				{
					name: "holds",
					type: "select",
					hasMany: true,
					options: [
						"price_below_minimum",
						"link_inactive",
						"product_unavailable",
						"supplier_unavailable",
						"reseller_ineligible",
						"reseller_level_too_low",
						"terms_not_accepted",
						"moderation",
					].map((value) => ({ label: value, value })),
				},
			],
		},
		{
			name: "moderationHold",
			type: "checkbox",
			defaultValue: false,
			// Read-gated the same way Shops.suspendedNote is: staff only. The
			// subject of the decision this flag records must not even see it,
			// let alone read it back to confirm a write succeeded.
			access: { read: staffOnlyField },
			admin: {
				readOnly: true,
				description:
					"Set when a moderator takes this listing down and chooses not to restore it. Blocks the product service from republishing it on an ordinary sync (a stock movement, a product edit) until a moderator clears it.",
			},
		},
		{
			name: "orderable",
			type: "checkbox",
			virtual: true,
			admin: {
				readOnly: true,
				description:
					"Derived at read time from order settings, the shop and the product (lib/orderable.ts#isListingOrderable). Not stored.",
			},
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
