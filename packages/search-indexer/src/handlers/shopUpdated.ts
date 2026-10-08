import {
	deleteShopDocument,
	indexDocuments,
	indexShopDocument,
	type ListingDocument,
	type ShopDocument,
} from "../meilisearch.ts";
import { transformListing } from "./listingCreated.ts";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";
const PAGE_SIZE = 100;

const idOf = (value: unknown): string | null => {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && "id" in value)
		return String((value as { id: unknown }).id);
	return null;
};

export function transformShop(
	shop: Record<string, unknown>,
	deliveryCities: string[] = [],
): ShopDocument {
	const location = (shop.location ?? {}) as Record<string, unknown>;
	const owner =
		shop.owner && typeof shop.owner === "object"
			? (shop.owner as Record<string, unknown>)
			: null;
	const logo =
		shop.logo && typeof shop.logo === "object"
			? (shop.logo as Record<string, unknown>)
			: null;
	return {
		id: String(shop.id),
		handle: String(shop.handle),
		name: String(shop.name),
		description: typeof shop.description === "string" ? shop.description : null,
		city: typeof location.city === "string" ? location.city : null,
		region: typeof location.region === "string" ? location.region : null,
		countryCode:
			typeof location.countryCode === "string" ? location.countryCode : null,
		categoryIds: Array.isArray(shop.categories)
			? shop.categories.map(idOf).filter((id): id is string => Boolean(id))
			: [],
		level: typeof shop.level === "number" ? shop.level : 1,
		levelExpiresAt:
			typeof shop.levelExpiresAt === "string" ? shop.levelExpiresAt : null,
		publishedListingCount: Number(shop.publishedListingCount ?? 0),
		createdAt: String(shop.createdAt ?? ""),
		logoUrl: typeof logo?.url === "string" ? logo.url : null,
		ownerRating: Number(owner?.rating ?? 0),
		ownerReviews: Number(owner?.totalReviews ?? 0),
		deliveryCities,
	};
}

export async function fetchDeliveryCities(shopId: string): Promise<string[]> {
	const response = await fetch(
		`${PAYLOAD_API_URL}/public/shops/${encodeURIComponent(shopId)}/delivery-cities`,
	);
	if (!response.ok)
		throw new Error(
			`Failed to fetch delivery cities of shop ${shopId}: ${response.status}`,
		);
	const data = (await response.json()) as { deliveryCities?: unknown };
	return Array.isArray(data.deliveryCities)
		? data.deliveryCities.filter(
				(city): city is string => typeof city === "string",
			)
		: [];
}

/** Public REST only returns published listings, which is exactly what belongs in the index. */
export async function reindexShopListings(shopId: string): Promise<number> {
	let page = 1;
	let indexed = 0;
	for (;;) {
		const response = await fetch(
			`${PAYLOAD_API_URL}/listings?where[shop][equals]=${encodeURIComponent(shopId)}&depth=2&limit=${PAGE_SIZE}&page=${page}`,
		);
		if (!response.ok)
			throw new Error(
				`Failed to fetch listings of shop ${shopId}: ${response.status}`,
			);
		const data = (await response.json()) as {
			docs: Record<string, unknown>[];
			hasNextPage: boolean;
		};
		const docs: ListingDocument[] = data.docs
			.filter((listing) => listing.status === "published")
			.map(transformListing);
		await indexDocuments(docs);
		indexed += docs.length;
		if (!data.hasNextPage) return indexed;
		page++;
	}
}

/**
 * The public read only returns active shops, so a 404 is how suspension and
 * closure reach the index.
 */
export async function handleShopUpdated(
	shopId: string,
	options: { reindexListings?: boolean } = {},
): Promise<void> {
	const response = await fetch(
		`${PAYLOAD_API_URL}/shops/${encodeURIComponent(shopId)}?depth=1`,
	);
	if (response.status === 404 || response.status === 403) {
		await deleteShopDocument(shopId);
	} else if (!response.ok) {
		throw new Error(`Failed to fetch shop ${shopId}: ${response.status}`);
	} else {
		// The public read's `status = active` filter (see Shops' `access.read`)
		// means a 200 here is always an active shop — there is no "200 with a
		// suspended shop" response to branch on.
		const shop = (await response.json()) as Record<string, unknown>;
		const deliveryCities = await fetchDeliveryCities(shopId);
		await indexShopDocument(transformShop(shop, deliveryCities));
	}

	if (options.reindexListings) {
		const count = await reindexShopListings(shopId);
		console.log(
			`[search-indexer] shopUpdated shop=${shopId} reindexedListings=${count}`,
		);
	}
}

export async function handleShopDeleted(shopId: string): Promise<void> {
	await deleteShopDocument(shopId);
}
