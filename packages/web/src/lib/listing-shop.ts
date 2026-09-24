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

export function shopLogoUrl(shop: Shop): string | null {
	const { logo } = shop;
	if (logo && typeof logo === "object") {
		return logo.thumbnailURL ?? logo.url ?? null;
	}
	return null;
}
