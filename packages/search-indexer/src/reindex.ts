import { transformListing } from "./handlers/listingCreated.ts";
import { fetchDeliveryCities, transformShop } from "./handlers/shopUpdated.ts";
import {
	clearIndex,
	clearShopsIndex,
	configureIndex,
	configureShopsIndex,
	indexDocuments,
	indexShopDocuments,
	type ListingDocument,
	pruneListings,
	pruneShops,
	readDocumentVersion,
	writeDocumentVersion,
} from "./meilisearch.ts";

/**
 * Bump whenever `transformListing` or `transformShop` changes what a document
 * holds. The worker compares it with the version stored in Meilisearch when
 * it starts and, when they differ, rebuilds both indexes in place — search
 * keeps answering throughout — so a deploy never needs a manual reindex.
 */
export const DOCUMENT_VERSION = "2026-10-14";

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";
const PAGE_SIZE = 100;

async function fetchAllListings(): Promise<{
	documents: ListingDocument[];
	total: number;
	skipped: number;
}> {
	const documents: ListingDocument[] = [];
	let page = 1;
	let hasMore = true;
	let total = 0;
	let skipped = 0;

	while (hasMore) {
		const response = await fetch(
			`${PAYLOAD_API_URL}/listings?depth=2&limit=${PAGE_SIZE}&page=${page}`,
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch listings: ${response.status}`);
		}

		const data = (await response.json()) as {
			docs: Record<string, unknown>[];
			hasNextPage: boolean;
			totalDocs: number;
		};

		total = data.totalDocs;

		for (const listing of data.docs) {
			if (listing.status === "published") {
				documents.push(transformListing(listing));
			} else {
				skipped++;
			}
		}

		console.log(
			`[search-indexer] reindex fetched page ${page} (${data.docs.length} listings, ${documents.length} indexed so far, ${skipped} skipped)`,
		);

		hasMore = data.hasNextPage;
		page++;
	}

	return { documents, total, skipped };
}

async function main(): Promise<void> {
	console.log("[search-indexer] reindex starting bulk reindex...");

	await configureIndex();

	console.log("[search-indexer] reindex clearing existing index...");
	await clearIndex();

	console.log("[search-indexer] reindex fetching all listings from Payload...");
	const { documents, total, skipped } = await fetchAllListings();

	console.log(
		`[search-indexer] reindex fetched ${total} total listings: ${documents.length} to index, ${skipped} skipped (not published)`,
	);

	if (documents.length > 0) {
		await indexDocuments(documents);
	}

	console.log(
		`[search-indexer] reindex complete: indexed=${documents.length} skipped=${skipped} total=${total}`,
	);

	await reindexShops();
}

/**
 * Pages every active shop into the shops index — a suspended or closed one has
 * no business there — and returns the ids it indexed.
 */
async function indexActiveShops(): Promise<Set<string>> {
	const ids = new Set<string>();
	for (let shopPage = 1; ; shopPage++) {
		const response = await fetch(
			`${PAYLOAD_API_URL}/shops?depth=1&limit=${PAGE_SIZE}&page=${shopPage}`,
		);
		if (!response.ok)
			throw new Error(`Failed to fetch shops: ${response.status}`);
		const data = (await response.json()) as {
			docs: Record<string, unknown>[];
			hasNextPage: boolean;
		};
		const docs = await Promise.all(
			data.docs
				.filter((shop) => shop.status === "active")
				.map(async (shop) => {
					const shopId = String(shop.id);
					return transformShop(shop, await fetchDeliveryCities(shopId));
				}),
		);
		await indexShopDocuments(docs);
		for (const doc of docs) ids.add(doc.id);
		if (!data.hasNextPage) return ids;
	}
}

export async function reindexShops(): Promise<number> {
	console.log("[search-indexer] reindex shops...");
	await configureShopsIndex();
	await clearShopsIndex();
	const shopCount = (await indexActiveShops()).size;
	console.log(`[search-indexer] reindex shops complete: indexed=${shopCount}`);
	return shopCount;
}

/**
 * Rebuilds both indexes when their documents predate `DOCUMENT_VERSION`.
 * Upserts everything, then deletes what no longer exists, instead of clearing
 * first: search never goes empty while it runs. The version is written last,
 * so an interrupted rebuild is simply redone at the next start.
 */
export async function ensureDocumentsCurrent(): Promise<boolean> {
	const stored = await readDocumentVersion();
	if (stored === DOCUMENT_VERSION) return false;
	console.log(
		`[search-indexer] documents at version ${stored ?? "none"}, rebuilding for ${DOCUMENT_VERSION}...`,
	);
	const { documents } = await fetchAllListings();
	await indexDocuments(documents);
	const staleListings = await pruneListings(
		new Set(documents.map((doc) => doc.id)),
	);
	const shopIds = await indexActiveShops();
	const staleShops = await pruneShops(shopIds);
	await writeDocumentVersion(DOCUMENT_VERSION);
	console.log(
		`[search-indexer] rebuild complete: listings=${documents.length} (-${staleListings}) shops=${shopIds.size} (-${staleShops})`,
	);
	return true;
}

// `import.meta.main` keeps a test import of this module from firing the
// bulk reindex against a real (or absent) Payload API.
if (import.meta.main) {
	main().catch((error) => {
		console.error("[search-indexer] reindex fatal error:", error);
		process.exit(1);
	});
}
