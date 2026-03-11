import {
	type ListingDocument,
	indexDocument,
} from "../meilisearch.ts";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";

export async function handleListingCreated(
	listingId: string,
): Promise<void> {
	console.log(`[handler] Processing listing.created for ${listingId}`);

	const response = await fetch(
		`${PAYLOAD_API_URL}/listings/${listingId}?depth=1`,
	);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch listing ${listingId}: ${response.status}`,
		);
	}

	const listing = (await response.json()) as Record<string, unknown>;
	const doc = transformListing(listing);
	await indexDocument(doc);
}

export function transformListing(
	listing: Record<string, unknown>,
): ListingDocument {
	const category = listing.category as Record<string, unknown> | null;
	const seller = listing.seller as Record<string, unknown> | string | null;
	const attributes =
		(listing.attributes as Record<string, unknown>) || {};

	const doc: ListingDocument = {
		id: listing.id as string,
		title: listing.title as string,
		description: listing.description as string,
		price: listing.price as number,
		location: listing.location as string,
		category: category ? (category.name as string) : null,
		categoryId: category
			? (category.id as string)
			: (listing.category as string),
		sellerId:
			typeof seller === "object" && seller
				? (seller.id as string)
				: (seller as string),
		status: listing.status as string,
		condition: (listing.condition as string) || null,
		boostedUntil: (listing.boostedUntil as string) || null,
		views: (listing.views as number) || 0,
		images: (listing.images as unknown[]) || [],
		createdAt: listing.createdAt as string,
		updatedAt: listing.updatedAt as string,
	};

	const categoryAttributes =
		category?.attributes as
			| Array<{ slug: string; filterable: boolean }>
			| undefined;

	if (categoryAttributes) {
		for (const attr of categoryAttributes) {
			if (attr.filterable && attributes[attr.slug] !== undefined) {
				doc[attr.slug] = attributes[attr.slug];
			}
		}
	} else {
		for (const [key, value] of Object.entries(attributes)) {
			doc[key] = value;
		}
	}

	return doc;
}
