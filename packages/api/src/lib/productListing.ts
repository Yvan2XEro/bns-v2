import type { Listing } from "../payload-types";
import { isRecord } from "./payments/types";
import { relationId } from "./relationId";
import { summarizeVariants, type VariantLike } from "./variants";

export type ListingCondition = NonNullable<Listing["condition"]>;

/** What `deriveListingData` reads; `Product` and `Shop` both satisfy it. */
export interface ProductLike {
	id: string;
	title: string;
	description?: string | null;
	category?: unknown;
	attributes?: unknown;
	condition?: ListingCondition | null;
	images?: readonly { image?: unknown }[] | null;
}

export interface ShopLike {
	id: string;
	location?: { city?: string | null; country?: string | null } | null;
}

export interface ListingDerivedData {
	title: string;
	description: string;
	images: { image: string }[];
	price: number | null;
	category: string | null;
	attributes: Record<string, unknown>;
	condition: ListingCondition | null;
	location: string;
	shop: string;
	product: string;
	productSummary: {
		priceMin: number | null;
		priceMax: number | null;
		available: number | null;
		variantCount: number;
		trackInventory: boolean;
	};
}

/** The marketplace is Cameroon-only; a shop without a location still needs one. */
const DEFAULT_LOCATION = "Cameroun";

function toAttributes(value: unknown): Record<string, unknown> {
	return isRecord(value) && !Array.isArray(value) ? value : {};
}

/**
 * Everything the listing shows, recomputed from the product and its live
 * variants. Every path that changes either of them calls this, so the two can
 * never drift: the listing owns no copy of its own.
 */
export function deriveListingData(
	product: ProductLike,
	variants: VariantLike[],
	shop: ShopLike,
): ListingDerivedData {
	const summary = summarizeVariants(variants);
	const description =
		typeof product.description === "string" && product.description.trim()
			? product.description
			: product.title;

	return {
		title: product.title,
		description,
		images: (product.images ?? []).flatMap((entry) => {
			const image = relationId(entry?.image);
			return image ? [{ image }] : [];
		}),
		price: summary.priceMin,
		category: relationId(product.category),
		attributes: toAttributes(product.attributes),
		condition: product.condition ?? null,
		location: shop.location?.city || shop.location?.country || DEFAULT_LOCATION,
		shop: shop.id,
		product: product.id,
		productSummary: {
			priceMin: summary.priceMin,
			priceMax: summary.priceMax,
			available: summary.available,
			variantCount: summary.variantCount,
			trackInventory: summary.trackInventory,
		},
	};
}

/**
 * A moderator's rejection outlives product edits, and a listing still waiting
 * for review (moved in while pending) stays in the queue. Anything but an
 * active product is unpublished, so a draft or archived product never leaves a
 * live listing behind.
 */
export function listingStatusFor(
	productStatus: string,
	current: string | null,
): Listing["status"] {
	if (current === "rejected") return "rejected";
	if (productStatus === "active")
		return current === "pending" ? "pending" : "published";
	return "draft";
}
