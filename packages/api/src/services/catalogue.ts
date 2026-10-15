import type { Payload } from "payload";
import { can } from "../access/shopRoles";
import { NOT_ARCHIVED, PUBLIC_VARIANTS } from "../collections/ProductVariants";
import type {
	CatalogueProvenance,
	CatalogueSort,
} from "../contracts/catalogue";
import { categoryWithDescendants } from "../lib/categoryDescendants";
import { ERROR_CODES } from "../lib/errors";
import { type MediaRef, toMediaRef } from "../lib/publicShop";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	availableOf,
	isLowStock,
	isOutOfStock,
	redactManagerOnlyFields,
	summarizeVariants,
} from "../lib/variants";
import type { Listing, Media, Product, ProductVariant } from "../payload-types";
import { requireShopMember } from "./shopGuards";
import type { ServiceUser } from "./shops";
import { toMovementRows } from "./stock";

export interface CatalogueRow {
	id: string;
	title: string;
	status: string;
	image: MediaRef | null;
	variantCount: number;
	priceMin: number | null;
	priceMax: number | null;
	stockOnHand: number;
	available: number;
	trackInventory: boolean;
	lowStock: boolean;
	outOfStock: boolean;
	sku: string | null;
	listingId: string | null;
	listingStatus: string | null;
	updatedAt: string;
	/** "own": the shop's product and stock; "resale": a resale listing of a supplier's product. */
	provenance: "own" | "resale";
	supplier: { id: string; name: string } | null;
	/**
	 * Resale rows only: whether the supplier can still ship it. Never a unit
	 * count — the supplier's stock level is the supplier's data.
	 */
	supplierAvailable: boolean | null;
	skus: string[];
	categoryId: string | null;
	/** The variant a one-click stock adjustment targets, when there is exactly one. */
	singleVariantId: string | null;
}

function toRow(
	product: Product,
	variants: ProductVariant[],
	listingStatus: string | null,
): CatalogueRow {
	const summary = summarizeVariants(variants);
	const tracked = variants.filter((v) => v.trackInventory === true);
	return {
		id: String(product.id),
		title: String(product.title),
		status: String(product.status),
		image: toMediaRef(product.images?.[0]?.image),
		variantCount: summary.variantCount,
		priceMin: summary.priceMin,
		priceMax: summary.priceMax,
		stockOnHand: summary.stockOnHand,
		available: summary.available ?? 0,
		trackInventory: summary.trackInventory,
		lowStock: variants.some(isLowStock),
		outOfStock: tracked.length > 0 && tracked.every(isOutOfStock),
		sku: variants[0]?.sku ?? null,
		listingId: relationId(product.listing),
		listingStatus,
		updatedAt: String(product.updatedAt ?? ""),
		provenance: "own",
		supplier: null,
		supplierAvailable: null,
		skus: variants
			.map((v) => v.sku)
			.filter((sku): sku is string => Boolean(sku)),
		categoryId: relationId(product.category),
		singleVariantId: variants.length === 1 ? String(variants[0].id) : null,
	};
}

/**
 * A resale listing sits in the reseller's catalogue without a product of its
 * own: its status, prices and availability come from the listing the resale
 * service maintains.
 */
function toResaleRow(
	listing: Listing,
	supplierName: string | null,
): CatalogueRow {
	const prices = (listing.resale?.prices ?? [])
		.map((entry) => Number(entry.price))
		.filter((price) => Number.isFinite(price));
	const supplierId = relationId(listing.resale?.supplierShop) ?? "";
	const supplierAvailable = listing.productSummary?.available === true;
	return {
		id: String(listing.id),
		title: String(listing.title),
		status: listing.status === "published" ? "active" : "draft",
		image: toMediaRef(listing.images?.[0]?.image),
		variantCount: Number(listing.productSummary?.variantCount ?? prices.length),
		priceMin: prices.length ? Math.min(...prices) : null,
		priceMax: prices.length ? Math.max(...prices) : null,
		stockOnHand: 0,
		available: 0,
		trackInventory: false,
		lowStock: false,
		outOfStock: !supplierAvailable,
		sku: null,
		listingId: String(listing.id),
		listingStatus: String(listing.status),
		updatedAt: String(listing.updatedAt ?? ""),
		provenance: "resale",
		supplier: { id: supplierId, name: supplierName ?? "" },
		supplierAvailable,
		skus: [],
		categoryId: relationId(listing.category),
		singleVariantId: null,
	};
}

function compareRows(sort: CatalogueSort) {
	return (a: CatalogueRow, b: CatalogueRow): number => {
		if (sort === "title") return a.title.localeCompare(b.title);
		if (sort === "price")
			return (
				(a.priceMin ?? Number.MAX_SAFE_INTEGER) -
				(b.priceMin ?? Number.MAX_SAFE_INTEGER)
			);
		if (sort === "stock") return a.available - b.available;
		return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
	};
}

async function resaleRows(
	payload: Payload,
	shopId: string,
): Promise<CatalogueRow[]> {
	const listings = (
		await payload.find({
			collection: "listings",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ status: { not_in: ["deleted"] } },
				],
			},
			depth: 1,
			limit: 0,
			pagination: false,
			overrideAccess: true,
		})
	).docs.filter((listing) => relationId(listing.resale?.supplierShop));
	const supplierIds = [
		...new Set(
			listings
				.map((listing) => relationId(listing.resale?.supplierShop))
				.filter((id): id is string => Boolean(id)),
		),
	];
	const suppliers = supplierIds.length
		? (
				await payload.find({
					collection: "shops",
					where: { id: { in: supplierIds } },
					depth: 0,
					limit: 0,
					pagination: false,
					overrideAccess: true,
				})
			).docs
		: [];
	const names = new Map(suppliers.map((s) => [String(s.id), String(s.name)]));
	return listings.map((listing) =>
		toResaleRow(
			listing,
			names.get(relationId(listing.resale?.supplierShop) ?? "") ?? null,
		),
	);
}

export async function listCatalogue(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	query: {
		status?: string | null;
		stock?: string | null;
		q?: string | null;
		page?: number;
		limit?: number;
		category?: string | null;
		sort?: CatalogueSort | null;
		/** Defaults to "own": the catalogue read before resale rows existed. */
		provenance?: CatalogueProvenance | null;
	},
) {
	const { role } = await requireShopMember(payload, user, shopId);
	const provenance = query.provenance ?? "own";

	const [products, variants] = await Promise.all([
		payload.find({
			collection: "products",
			where: { shop: { equals: shopId } },
			sort: "-updatedAt",
			depth: 1,
			limit: 0,
			pagination: false,
			overrideAccess: true,
		}),
		payload.find({
			collection: "product-variants",
			where: { and: [{ shop: { equals: shopId } }, NOT_ARCHIVED] },
			sort: "createdAt",
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
		}),
	]);

	const byProduct = new Map<string, ProductVariant[]>();
	for (const variant of variants.docs) {
		const key = relationId(variant.product) ?? "";
		byProduct.set(key, [...(byProduct.get(key) ?? []), variant]);
	}

	const listingIds = products.docs
		.map((p) => relationId(p.listing))
		.filter((id): id is string => Boolean(id));
	const listings = listingIds.length
		? await payload.find({
				collection: "listings",
				where: { id: { in: listingIds } },
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
			})
		: { docs: [] as Listing[] };
	const listingStatus = new Map(
		listings.docs.map((l) => [String(l.id), String(l.status)]),
	);

	const ownRows = products.docs.map((p) =>
		toRow(
			p,
			byProduct.get(String(p.id)) ?? [],
			listingStatus.get(relationId(p.listing) ?? "") ?? null,
		),
	);
	// Supplier names and resale prices are resale-manager data, like the
	// product's own resale settings.
	const resale =
		provenance !== "own" && can(role, "resale.manage")
			? await resaleRows(payload, shopId)
			: [];
	const rows =
		provenance === "resale"
			? resale
			: provenance === "any"
				? [...ownRows, ...resale]
				: ownRows;
	const counts = {
		all: rows.length,
		active: rows.filter((r) => r.status === "active").length,
		draft: rows.filter((r) => r.status === "draft").length,
		archived: rows.filter((r) => r.status === "archived").length,
		low: rows.filter((r) => r.lowStock).length,
		out: rows.filter((r) => r.outOfStock).length,
		resale: resale.length,
	};

	const categories = query.category
		? new Set(await categoryWithDescendants(payload, query.category))
		: null;
	const q = query.q?.trim().toLowerCase() ?? "";
	const filtered = rows.filter((row) => {
		if (categories && !categories.has(row.categoryId ?? "")) return false;
		if (query.status && row.status !== query.status) return false;
		if (query.stock === "low" && !row.lowStock) return false;
		if (query.stock === "out" && !row.outOfStock) return false;
		if (q) {
			const skus = (byProduct.get(row.id) ?? []).map((v) =>
				String(v.sku ?? "").toLowerCase(),
			);
			if (
				!row.title.toLowerCase().includes(q) &&
				!skus.some((sku) => sku.includes(q)) &&
				!row.supplier?.name.toLowerCase().includes(q)
			)
				return false;
		}
		return true;
	});
	filtered.sort(compareRows(query.sort ?? "updated"));

	const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));
	const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
	const page = Math.min(totalPages, Math.max(1, Math.floor(query.page ?? 1)));
	return {
		docs: filtered.slice((page - 1) * limit, page * limit),
		totalDocs: filtered.length,
		page,
		totalPages,
		counts,
	};
}

/** What the product-detail screen shows; never the raw document — see `toProductDetailView`. */
export interface ProductDetailView {
	id: string;
	shopId: string;
	title: string;
	description: string | null;
	category: string | null;
	condition: Product["condition"] | null;
	attributes: Product["attributes"] | null;
	images: MediaRef[];
	status: Product["status"];
	options: { name: string; values: string[] }[];
	delivery: {
		handlingHours: number | null;
		weightGrams: number | null;
		codAllowed: boolean;
		pickupAllowed: boolean;
	};
	returnPolicy: string | null;
	warrantyMonths: number | null;
	updatedAt: string;
	createdAt: string;
}

/**
 * Shapes the product deliberately instead of handing back the raw document:
 * a depth-1 read of `products` would populate `shop` into the full `Shop`
 * document, including the moderator-only suspension note and the moderator
 * who wrote it — neither belongs in front of a shop member, let alone staff.
 */
function toProductDetailView(
	product: Product,
	images: MediaRef[],
): ProductDetailView {
	return {
		id: String(product.id),
		shopId: relationId(product.shop) ?? "",
		title: product.title,
		description: product.description ?? null,
		category: relationId(product.category),
		condition: product.condition ?? null,
		attributes: product.attributes ?? null,
		images,
		status: product.status,
		options: (product.options ?? []).map((option) => ({
			name: option.name,
			values: option.values,
		})),
		delivery: {
			handlingHours: product.delivery?.handlingHours ?? null,
			weightGrams: product.delivery?.weightGrams ?? null,
			codAllowed: product.delivery?.codAllowed !== false,
			pickupAllowed: product.delivery?.pickupAllowed === true,
		},
		returnPolicy: product.returnPolicy ?? null,
		warrantyMonths: product.warrantyMonths ?? null,
		updatedAt: product.updatedAt,
		createdAt: product.createdAt,
	};
}

export async function getProductDetail(
	payload: Payload,
	user: ServiceUser,
	productId: string,
) {
	let product: Product;
	try {
		// depth 0: relations stay ids. Anything the screen needs is resolved
		// explicitly below, so nothing gets served just because it was populated.
		product = await payload.findByID({
			collection: "products",
			id: productId,
			depth: 0,
			overrideAccess: true,
		});
	} catch {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	const { role } = await requireShopMember(
		payload,
		user,
		relationId(product.shop) ?? "",
	);
	const canSeeCost = can(role, "costs.view");

	const variants = (
		await payload.find({
			collection: "product-variants",
			where: { and: [{ product: { equals: productId } }, NOT_ARCHIVED] },
			sort: "createdAt",
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
		})
	).docs;
	redactManagerOnlyFields(variants, canSeeCost);

	const imageIds = (product.images ?? [])
		.map((entry) => relationId(entry.image))
		.filter((id): id is string => Boolean(id));
	const mediaById: Map<string, Media> = imageIds.length
		? new Map(
				(
					await payload.find({
						collection: "media",
						where: { id: { in: imageIds } },
						depth: 0,
						limit: 0,
						pagination: false,
						overrideAccess: true,
					})
				).docs.map((doc) => [String(doc.id), doc]),
			)
		: new Map();
	const images = imageIds
		.map((id) => toMediaRef(mediaById.get(id)))
		.filter((ref): ref is MediaRef => ref !== null);

	const listingId = relationId(product.listing);
	let listing: {
		id: string;
		status: string;
		views: number;
		favorites: number;
	} | null = null;
	if (listingId) {
		const doc = await payload
			.findByID({
				collection: "listings",
				id: listingId,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		if (doc) {
			const favorites = await payload.count({
				collection: "favorites",
				where: { listing: { equals: listingId } },
				overrideAccess: true,
			});
			listing = {
				id: listingId,
				status: String(doc.status),
				views: Number(doc.views ?? 0),
				favorites: favorites.totalDocs,
			};
		}
	}

	const movements = await payload.find({
		collection: "stock-movements",
		where: { product: { equals: productId } },
		sort: "-createdAt",
		limit: 5,
		depth: 0,
		overrideAccess: true,
	});
	return {
		product: toProductDetailView(product, images),
		variants,
		listing,
		movements: await toMovementRows(payload, movements.docs, {
			redactCost: !canSeeCost,
		}),
		role,
	};
}

/** What a buyer's variant selector shows: never `cost`, never a raw stock count. */
export interface PublicVariantView {
	id: string;
	optionValues: Record<string, string> | null;
	price: number;
	trackInventory: boolean;
	available: boolean;
	/**
	 * The units left, only when inventory is tracked and the figure is small
	 * (1 to `PUBLIC_STOCK_CAP`). Above that, or untracked, it is null and the
	 * buyer reads a plain "in stock": a shop's full stock level is its own data.
	 */
	availableCount: number | null;
}

export const PUBLIC_STOCK_CAP = 10;

function publicAvailableCount(variant: ProductVariant): number | null {
	if (variant.trackInventory !== true) return null;
	const count = availableOf(variant);
	return count > 0 && count <= PUBLIC_STOCK_CAP ? count : null;
}

function toPublicVariantView(variant: ProductVariant): PublicVariantView {
	const values = variant.optionValues;
	return {
		id: String(variant.id),
		optionValues:
			values && typeof values === "object" && !Array.isArray(values)
				? (values as Record<string, string>)
				: null,
		price: variant.price,
		trackInventory: variant.trackInventory === true,
		available: !isOutOfStock(variant),
		availableCount: publicAvailableCount(variant),
	};
}

/**
 * The buyer-facing twin of the collection's own `GET /api/product-variants`:
 * that route's `shopScopedRead` deliberately unions in the caller's own shop
 * rows (a staff member picking a variant to receive stock needs to see a
 * draft product's variants too), so a signed-in owner browsing their own
 * product's public listing page would otherwise see draft and archived
 * variants a stranger never would. This always applies `PUBLIC_VARIANTS`,
 * with no caller identity to widen it, so every viewer of a listing page —
 * owner included — sees the same catalogue.
 */
export async function listPublicVariants(
	payload: Payload,
	productId: string,
): Promise<{ docs: PublicVariantView[] }> {
	const result = await payload.find({
		collection: "product-variants",
		where: { and: [{ product: { equals: productId } }, PUBLIC_VARIANTS] },
		sort: "createdAt",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	return { docs: result.docs.map(toPublicVariantView) };
}
