import {
	deleteDocument,
	indexDocument,
	type ListingDocument,
} from "../meilisearch.ts";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";

export async function handleListingCreated(listingId: string): Promise<void> {
	const response = await fetch(
		`${PAYLOAD_API_URL}/listings/${listingId}?depth=2`,
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch listing ${listingId}: ${response.status}`);
	}

	const listing = (await response.json()) as Record<string, unknown>;

	// Only index published listings; remove from index if status changed
	if (listing.status !== "published") {
		console.log(
			`[search-indexer] listingCreated listing=${listingId} status=${listing.status} action=skipped`,
		);
		await deleteDocument(listingId);
		return;
	}

	const start = Date.now();
	const doc = transformListing(listing);
	await indexDocument(doc);
	console.log(
		`[search-indexer] listingCreated listing=${listingId} status=${listing.status} action=indexed duration=${Date.now() - start}ms`,
	);
}

export function transformListing(
	listing: Record<string, unknown>,
): ListingDocument {
	const category = listing.category as Record<string, unknown> | null;
	const seller = listing.seller as Record<string, unknown> | string | null;
	const attributes = (listing.attributes as Record<string, unknown>) || {};
	const images = Array.isArray(listing.images)
		? listing.images
				.map((entry) => {
					if (!entry || typeof entry !== "object") {
						return null;
					}

					const imageEntry = entry as {
						id?: string | null;
						image?: string | Record<string, unknown> | null;
					};
					const image = imageEntry.image;

					if (!image) {
						return null;
					}

					if (typeof image === "string") {
						return {
							id: imageEntry.id ?? null,
							image: { id: image },
						};
					}

					return {
						id: imageEntry.id ?? null,
						image: {
							id: (image.id as string) || null,
							url: (image.url as string) || null,
							thumbnailURL: (image.thumbnailURL as string) || null,
							filename: (image.filename as string) || null,
							alt: (image.alt as string) || null,
							width: (image.width as number) || null,
							height: (image.height as number) || null,
						},
					};
				})
				.filter(Boolean)
		: [];

	// Tags are populated objects at depth=2: { id, name, slug, emoji }
	const tags = Array.isArray(listing.tags)
		? (listing.tags as unknown[])
				.map((t) =>
					typeof t === "object" && t !== null
						? ((t as Record<string, unknown>).slug as string | undefined)
						: undefined,
				)
				.filter((s): s is string => !!s)
		: [];

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
		tags,
		boostedUntil: (listing.boostedUntil as string) || null,
		views: (listing.views as number) || 0,
		images,
		createdAt: listing.createdAt as string,
		updatedAt: listing.updatedAt as string,
	};

	const coordinates = listing.coordinates as
		| { lat?: number; lng?: number }
		| undefined;
	if (coordinates?.lat && coordinates?.lng) {
		doc._geo = { lat: coordinates.lat, lng: coordinates.lng };
	}

	const categoryAttributes = category?.attributes as
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
