import type { Payload, PayloadRequest, Where } from "payload";
import { PRODUCT_SERVICE_CONTEXT } from "../collections/Products";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { addDays, normalizeHandle } from "../lib/shopHandle";
import { RetryTransaction, withTransaction } from "../lib/transactions";
import type { Listing, Product, Shop } from "../payload-types";
import { syncProductListing } from "./products";
import { requireShopMember } from "./shopGuards";
import { isUniqueViolation, type ServiceUser, writeShop } from "./shops";

type SkipReason = "notOwner" | "otherShop" | "alreadyAttached" | "status";

const ATTACHABLE = new Set<Listing["status"]>([
	"draft",
	"pending",
	"published",
	"expired",
]);
/** Detached listings become classified ads again, which expire. */
const DETACHED_LISTING_DAYS = 30;

function idList(value: unknown): string[] {
	return Array.isArray(value)
		? [
				...new Set(
					value.filter(
						(id): id is string => typeof id === "string" && id.length > 0,
					),
				),
			]
		: [];
}

/**
 * The classified listing keeps its id, so its favourites, conversations and
 * moderation history stay attached; only its commercial fields become the
 * product's, through `syncProductListing`. The listing carried no stock
 * count as a classified ad, so the variant it gets starts untracked at zero —
 * the same state the stock service leaves a receipt-free variant in.
 */
async function attachOne(
	req: PayloadRequest,
	shopId: string,
	listing: Listing,
): Promise<string> {
	let product: Product;
	try {
		product = await req.payload.create({
			collection: "products",
			req,
			overrideAccess: true,
			context: PRODUCT_SERVICE_CONTEXT,
			data: {
				shop: shopId,
				title: listing.title.slice(0, 120),
				description: listing.description ?? null,
				category: relationId(listing.category) ?? "",
				condition: listing.condition ?? null,
				attributes: listing.attributes ?? {},
				images: (listing.images ?? [])
					.map((entry) => relationId(entry.image))
					.filter((id): id is string => Boolean(id))
					.map((image) => ({ image })),
				status:
					listing.status === "published" || listing.status === "pending"
						? "active"
						: "draft",
				options: [],
				delivery: { codAllowed: true, pickupAllowed: false },
				listing: listing.id,
			},
		});
	} catch (error) {
		// Two concurrent attaches of the same never-attached listing: the partial
		// unique index on `products.listing` (migration
		// 20260923_000000_p1_product_listing) refuses the second insert — the same
		// shape as `syncProductListing`'s own race on `listings.product`. Retrying
		// the whole transaction re-reads the listing fresh, and the caller's loop
		// finds `product` already set and reports it as "alreadyAttached" instead
		// of creating a second product for it.
		if (!isUniqueViolation(error)) throw error;
		throw new RetryTransaction("another writer already attached this listing");
	}

	await req.payload.create({
		collection: "product-variants",
		req,
		overrideAccess: true,
		context: PRODUCT_SERVICE_CONTEXT,
		data: {
			product: product.id,
			shop: shopId,
			optionValues: {},
			sku: null,
			price: typeof listing.price === "number" ? listing.price : 0,
			trackInventory: false,
			stockOnHand: 0,
			stockReserved: 0,
		},
	});

	await req.payload.update({
		collection: "listings",
		id: listing.id,
		req,
		overrideAccess: true,
		context: PRODUCT_SERVICE_CONTEXT,
		data: { shop: shopId, product: product.id, expiresAt: null },
	});
	await syncProductListing(req, product.id);
	return product.id;
}

/** Returns the listing to a plain classified ad and archives the product that published it. */
async function detachOne(
	req: PayloadRequest,
	listing: Listing,
	now: Date,
): Promise<void> {
	const productId = relationId(listing.product);
	if (productId) {
		await req.payload.update({
			collection: "products",
			id: productId,
			req,
			overrideAccess: true,
			context: PRODUCT_SERVICE_CONTEXT,
			data: { status: "archived", listing: null },
		});
	}
	await req.payload.update({
		collection: "listings",
		id: listing.id,
		req,
		overrideAccess: true,
		context: PRODUCT_SERVICE_CONTEXT,
		data: {
			shop: null,
			product: null,
			// `productSummary` is a non-nullable group in the generated type — a
			// type-gen gap, not a constraint Mongo enforces — but the field
			// genuinely goes empty once the listing is no longer a product's.
			// Narrowed to this one field so `shop`/`product`/`expiresAt` above
			// still type-check normally.
			productSummary: null as unknown as Listing["productSummary"],
			expiresAt: addDays(now, DETACHED_LISTING_DAYS).toISOString(),
		},
	});
}

export async function attachListings(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: { listingIds?: unknown; all?: unknown },
): Promise<{
	attached: { listingId: string; productId: string }[];
	skipped: { listingId: string; reason: SkipReason }[];
}> {
	return withTransaction(
		payload,
		async (req) => {
			await requireShopMember(payload, user, shopId, { writable: true, req });

			const where: Where =
				input.all === true
					? {
							and: [
								{ seller: { equals: user.id } },
								{ shop: { exists: false } },
								{ status: { in: [...ATTACHABLE] } },
							],
						}
					: { id: { in: idList(input.listingIds) } };
			const listings = (
				await payload.find({
					collection: "listings",
					where,
					depth: 0,
					limit: 0,
					pagination: false,
					overrideAccess: true,
					req,
				})
			).docs;

			const attached: { listingId: string; productId: string }[] = [];
			const skipped: { listingId: string; reason: SkipReason }[] = [];
			for (const listing of listings) {
				const listingId = String(listing.id);
				const listingShop = relationId(listing.shop);
				if (relationId(listing.seller) !== user.id) {
					skipped.push({ listingId, reason: "notOwner" });
				} else if (listingShop && listingShop !== shopId) {
					skipped.push({ listingId, reason: "otherShop" });
				} else if (relationId(listing.product)) {
					skipped.push({ listingId, reason: "alreadyAttached" });
				} else if (
					!ATTACHABLE.has(listing.status) ||
					listing.title.trim().length < 3
				) {
					skipped.push({ listingId, reason: "status" });
				} else {
					attached.push({
						listingId,
						productId: await attachOne(req, shopId, listing),
					});
				}
			}
			return { attached, skipped };
		},
		{ user },
	);
}

export async function detachListings(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: { listingIds?: unknown },
	now: Date = new Date(),
): Promise<{ detached: string[] }> {
	return withTransaction(
		payload,
		async (req) => {
			await requireShopMember(payload, user, shopId, { req });
			const listings = (
				await payload.find({
					collection: "listings",
					where: { id: { in: idList(input.listingIds) } },
					depth: 0,
					limit: 0,
					pagination: false,
					overrideAccess: true,
					req,
				})
			).docs;

			const detached: string[] = [];
			for (const listing of listings) {
				if (
					relationId(listing.seller) !== user.id ||
					relationId(listing.shop) !== shopId
				) {
					continue;
				}
				await detachOne(req, listing, now);
				detached.push(String(listing.id));
			}
			return { detached };
		},
		{ user },
	);
}

/** Shared by `closeShop` and `closeOwnedShops`: detach every listing, archive every product, close the shop. */
export async function closeShopInTransaction(
	req: PayloadRequest,
	shop: Shop,
	now: Date,
): Promise<string[]> {
	const shopId = String(shop.id);
	const listings = (
		await req.payload.find({
			collection: "listings",
			where: { shop: { equals: shopId } },
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			req,
		})
	).docs;
	for (const listing of listings) await detachOne(req, listing, now);

	const products = (
		await req.payload.find({
			collection: "products",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ status: { not_equals: "archived" } },
				],
			},
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			req,
		})
	).docs;
	for (const product of products) {
		await req.payload.update({
			collection: "products",
			id: product.id,
			req,
			overrideAccess: true,
			context: PRODUCT_SERVICE_CONTEXT,
			data: { status: "archived", listing: null },
		});
	}

	// Variants of these products are intentionally left with `archivedAt: null`.
	// `PUBLIC_VARIANTS` and the `products` read access both gate on the parent
	// product's `status: "active"`, so an archived product's variants are
	// already unreachable to a buyer or non-member (list, direct id, or a
	// stale link alike); every route that can write to a variant requires an
	// `active` shop (`requireShopMember(..., { writable: true })` -> 409), so
	// nothing can act on their stock while the shop is closed; and handle
	// re-adoption after the hold period creates a brand-new shop document, so
	// there is no reopen path that would resurrect this stale stock under a
	// live product again.
	await writeShop(req, shopId, {
		status: "closed",
		closedAt: now.toISOString(),
	});
	return listings.map((listing) => String(listing.id));
}

export async function closeShop(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: { confirmation?: unknown },
	now: Date = new Date(),
): Promise<{ closed: true; detachedListingIds: string[] }> {
	const { shop } = await requireShopMember(payload, user, shopId, {
		owner: true,
		writable: true,
	});
	if (normalizeHandle(input.confirmation) !== shop.handle) {
		throw new ServiceError(ERROR_CODES.validation, 400);
	}

	const detachedListingIds = await withTransaction(
		payload,
		(req) => closeShopInTransaction(req, shop, now),
		{ user },
	);
	return { closed: true as const, detachedListingIds };
}

/**
 * Account deletion: the shop goes before the cascade deletes the owner's
 * listings. Pass the cascade's own `req` so this joins its transaction
 * instead of opening one per shop — a shop closed and committed ahead of a
 * cascade that then fails would leave the account intact but its shop
 * closed, its listings detached and its products archived, with nothing left
 * to roll that back. Called without `req` (e.g. directly, outside a cascade),
 * each shop still gets its own transaction, same as before.
 */
export async function closeOwnedShops(
	payload: Payload,
	userId: string,
	now: Date = new Date(),
	req?: PayloadRequest,
): Promise<string[]> {
	const shops = (
		await payload.find({
			collection: "shops",
			where: {
				and: [
					{ owner: { equals: userId } },
					{ status: { in: ["active", "suspended"] } },
				],
			},
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			req,
		})
	).docs;

	if (req) {
		for (const shop of shops) await closeShopInTransaction(req, shop, now);
		return shops.map((shop) => String(shop.id));
	}

	for (const shop of shops) {
		await withTransaction(payload, (txReq) =>
			closeShopInTransaction(txReq, shop, now),
		);
	}
	return shops.map((shop) => String(shop.id));
}
