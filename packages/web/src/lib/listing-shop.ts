import type { Listing, Product, Shop } from "~/types";

export interface ProductSummary {
	priceMin: number | null;
	priceMax: number | null;
	available: number | null;
	variantCount: number | null;
	trackInventory: boolean | null;
}

/** The populated shop of a listing, or null for a classified ad or an unpopulated id. */
export function listingShop(listing: Listing): Shop | null {
	const { shop } = listing;
	return shop && typeof shop === "object" ? shop : null;
}

export function listingShopId(listing: Listing): string | null {
	const { shop } = listing;
	if (typeof shop === "string") return shop;
	if (shop && typeof shop === "object") return shop.id;
	return null;
}

export function listingProductId(listing: Listing): string | null {
	const { product } = listing;
	if (typeof product === "string") return product;
	if (product && typeof product === "object") return String(product.id);
	return null;
}

export function listingProduct(listing: Listing): Product | null {
	const { product } = listing;
	return product && typeof product === "object" ? product : null;
}

export function productSummaryOf(listing: Listing): ProductSummary | null {
	const { productSummary } = listing;
	if (!productSummary) return null;
	return {
		priceMin: productSummary.priceMin ?? null,
		priceMax: productSummary.priceMax ?? null,
		available: productSummary.available ?? null,
		variantCount: productSummary.variantCount ?? null,
		trackInventory: productSummary.trackInventory ?? null,
	};
}

const asString = (value: unknown): string | null =>
	typeof value === "string" ? value : null;
const asNumber = (value: unknown): number | null =>
	typeof value === "number" ? value : null;

/**
 * The shop name for a listing card: a search hit flattens `shopName` onto
 * the listing (see `serializeListingHit` on the API side), a Payload doc
 * only carries the populated relation. Reads whichever is present.
 */
export function listingShopName(listing: Listing): string | null {
	const record: Record<string, unknown> = listing;
	return asString(record.shopName) ?? listingShop(listing)?.name ?? null;
}

/**
 * The top of a product's price range: a search hit flattens `priceMax` onto
 * the listing, a Payload doc only carries it inside `productSummary`. Reads
 * whichever is present.
 */
export function listingPriceMax(listing: Listing): number | null {
	const record: Record<string, unknown> = listing;
	return (
		asNumber(record.priceMax) ?? productSummaryOf(listing)?.priceMax ?? null
	);
}

export function shopLogoUrl(shop: Shop): string | null {
	const { logo } = shop;
	if (logo && typeof logo === "object") {
		return logo.thumbnailURL ?? logo.url ?? null;
	}
	return null;
}
