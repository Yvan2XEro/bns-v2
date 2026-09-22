import type { Payload } from "payload";
import { canManageShop } from "../access/shopRoles";
import { NOT_ARCHIVED } from "../collections/ProductVariants";
import { ERROR_CODES } from "../lib/errors";
import { type MediaRef, toMediaRef } from "../lib/publicShop";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { isLowStock, isOutOfStock, summarizeVariants } from "../lib/variants";
import { requireShopMember } from "./shopGuards";
import type { ServiceUser } from "./shops";
import { toMovementRows } from "./stock";

// biome-ignore lint/suspicious/noExplicitAny: Payload documents arrive at varying depths
type Doc = Record<string, any>;

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
}

function toRow(
	product: Doc,
	variants: Doc[],
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
	};
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
	},
) {
	await requireShopMember(payload, user, shopId);

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

	const byProduct = new Map<string, Doc[]>();
	for (const variant of variants.docs as Doc[]) {
		const key = relationId(variant.product) ?? "";
		byProduct.set(key, [...(byProduct.get(key) ?? []), variant]);
	}

	const listingIds = (products.docs as Doc[])
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
		: { docs: [] };
	const listingStatus = new Map(
		(listings.docs as Doc[]).map((l) => [String(l.id), String(l.status)]),
	);

	const rows = (products.docs as Doc[]).map((p) =>
		toRow(
			p,
			byProduct.get(String(p.id)) ?? [],
			listingStatus.get(relationId(p.listing) ?? "") ?? null,
		),
	);
	const counts = {
		all: rows.length,
		active: rows.filter((r) => r.status === "active").length,
		draft: rows.filter((r) => r.status === "draft").length,
		archived: rows.filter((r) => r.status === "archived").length,
		low: rows.filter((r) => r.lowStock).length,
		out: rows.filter((r) => r.outOfStock).length,
	};

	const q = query.q?.trim().toLowerCase() ?? "";
	const filtered = rows.filter((row) => {
		if (query.status && row.status !== query.status) return false;
		if (query.stock === "low" && !row.lowStock) return false;
		if (query.stock === "out" && !row.outOfStock) return false;
		if (q) {
			const skus = (byProduct.get(row.id) ?? []).map((v) =>
				String(v.sku ?? "").toLowerCase(),
			);
			if (
				!row.title.toLowerCase().includes(q) &&
				!skus.some((sku) => sku.includes(q))
			)
				return false;
		}
		return true;
	});

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

export async function getProductDetail(
	payload: Payload,
	user: ServiceUser,
	productId: string,
) {
	let product: Doc;
	try {
		product = (await payload.findByID({
			collection: "products",
			id: productId,
			depth: 1,
			overrideAccess: true,
		})) as Doc;
	} catch {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	const { role } = await requireShopMember(
		payload,
		user,
		relationId(product.shop) ?? "",
	);

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
	).docs as Doc[];
	// The field must be gone, not merely undefined: JSON.stringify keeps an
	// undefined-valued key off the wire too, but callers should never be able
	// to detect the key existed on the source document.
	// biome-ignore lint/performance/noDelete: correctness over micro-perf on a small array
	if (!canManageShop(role)) for (const variant of variants) delete variant.cost;

	const listingId = relationId(product.listing);
	let listing: {
		id: string;
		status: string;
		views: number;
		favorites: number;
	} | null = null;
	if (listingId) {
		const doc = (await payload
			.findByID({
				collection: "listings",
				id: listingId,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null)) as Doc | null;
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
		product,
		variants,
		listing,
		movements: await toMovementRows(payload, movements.docs),
		role,
	};
}
