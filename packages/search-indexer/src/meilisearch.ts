import { MeiliSearch } from "meilisearch";

const MEILISEARCH_HOST =
	process.env.MEILISEARCH_HOST || "http://localhost:7700";
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || "";
const INDEX_NAME = "listings";

let client: MeiliSearch | null = null;

function getClient(): MeiliSearch {
	if (!client) {
		console.log(
			`[search-indexer] meilisearch connecting to ${MEILISEARCH_HOST}`,
		);
		client = new MeiliSearch({
			host: MEILISEARCH_HOST,
			apiKey: MEILISEARCH_API_KEY,
		});
	}
	return client;
}

export function getIndex() {
	return getClient().index(INDEX_NAME);
}

export type ListingDocument = {
	id: string;
	title: string;
	description: string;
	price: number;
	location: string;
	category: string | null;
	categoryId: string;
	sellerId: string;
	status: string;
	condition: string | null;
	tags: string[];
	boostedUntil: string | null;
	views: number;
	images: unknown[];
	createdAt: string;
	updatedAt: string;
	[key: string]: unknown;
};

export async function indexDocument(doc: ListingDocument): Promise<void> {
	const index = getIndex();
	try {
		await index.addDocuments([doc], { primaryKey: "id" });
	} catch (error) {
		console.error(
			`[search-indexer] meilisearch failed to index listing ${doc.id}:`,
			error,
		);
		throw error;
	}
}

export async function deleteDocument(id: string): Promise<void> {
	const index = getIndex();
	try {
		await index.deleteDocument(id);
		console.log(`[search-indexer] meilisearch deleted listing ${id}`);
	} catch (error) {
		console.error(
			`[search-indexer] meilisearch failed to delete listing ${id}:`,
			error,
		);
		throw error;
	}
}

export async function indexDocuments(docs: ListingDocument[]): Promise<void> {
	if (docs.length === 0) return;

	const index = getIndex();
	const BATCH_SIZE = 500;
	const totalBatches = Math.ceil(docs.length / BATCH_SIZE);

	for (let i = 0; i < docs.length; i += BATCH_SIZE) {
		const batch = docs.slice(i, i + BATCH_SIZE);
		const batchNum = Math.floor(i / BATCH_SIZE) + 1;
		try {
			await index.addDocuments(batch, { primaryKey: "id" });
			console.log(
				`[search-indexer] meilisearch indexed batch ${batchNum}/${totalBatches} (${batch.length} documents)`,
			);
		} catch (error) {
			console.error(
				`[search-indexer] meilisearch failed on batch ${batchNum}/${totalBatches}:`,
				error,
			);
			throw error;
		}
	}
}

const PAYLOAD_API_URL =
	process.env.PAYLOAD_API_URL || "http://localhost:3000/api";

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Every attribute slug a category declares filterable.
 *
 * Returns `null` when Payload could not be reached at all, which is a very
 * different thing from "no category declares one" — and conflating the two is
 * what broke search filtering in production. This worker starts alongside the
 * API (compose only waits for the container to *start*, not for Next to
 * listen), so the first request here regularly lands before anything answers.
 * The old version swallowed that, returned an empty list, and the index was
 * configured with only the static attributes — every category filter then made
 * Meilisearch reject the query for the lifetime of the deployment.
 */
async function fetchFilterableAttributeSlugs(
	attempts = 10,
	delayMs = 3000,
): Promise<string[] | null> {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const res = await fetch(`${PAYLOAD_API_URL}/categories?limit=0&depth=0`);
			if (res.ok) {
				const data = (await res.json()) as {
					docs: Array<{
						attributes?: Array<{ slug: string; filterable?: boolean }>;
					}>;
				};
				const slugs = new Set<string>();
				for (const cat of data.docs) {
					for (const attr of cat.attributes || []) {
						if (attr.filterable && attr.slug) {
							slugs.add(attr.slug);
						}
					}
				}
				return Array.from(slugs);
			}
			console.warn(
				`[search-indexer] categories request returned ${res.status} (attempt ${attempt}/${attempts})`,
			);
		} catch (error) {
			console.warn(
				`[search-indexer] cannot reach Payload at ${PAYLOAD_API_URL} (attempt ${attempt}/${attempts}):`,
				error instanceof Error ? error.message : error,
			);
		}

		if (attempt < attempts) await sleep(delayMs);
	}

	return null;
}

/** Filterable regardless of what the categories declare. */
const STATIC_FILTERABLE_ATTRIBUTES = [
	"status",
	"categoryId",
	"condition",
	"price",
	"location",
	"boostedUntil",
	"sellerId",
	"tags",
	"_geo",
];

/** What the index was last configured with, to skip no-op settings updates. */
let configuredAttributes: string[] | null = null;

export async function configureIndex(
	attempts = 10,
	delayMs = 3000,
): Promise<void> {
	const index = getIndex();

	const dynamicAttrs = await fetchFilterableAttributeSlugs(attempts, delayMs);
	if (dynamicAttrs === null) {
		// Crashing is the honest outcome: this worker cannot index a listing
		// without Payload either, and carrying on would quietly publish an index
		// that rejects every category filter. Docker restarts us, and by then the
		// API is usually up.
		throw new Error(
			`Could not read category attributes from ${PAYLOAD_API_URL}. Refusing to configure the index without them — every category filter would fail.`,
		);
	}

	if (dynamicAttrs.length > 0) {
		console.log(
			`[search-indexer] meilisearch dynamic filterable attributes: ${dynamicAttrs.join(", ")}`,
		);
	} else {
		console.warn(
			"[search-indexer] no category declares a filterable attribute — category filters will match nothing",
		);
	}

	const filterableAttributes = [
		...STATIC_FILTERABLE_ATTRIBUTES,
		...dynamicAttrs,
	];

	// A settings update makes Meilisearch reindex, so it is worth not repeating
	// one that changes nothing.
	if (
		configuredAttributes !== null &&
		configuredAttributes.length === filterableAttributes.length &&
		configuredAttributes.every((slug, i) => slug === filterableAttributes[i])
	) {
		return;
	}

	try {
		await index.updateSettings({
			searchableAttributes: [
				"title",
				"description",
				"location",
				"category",
				"tags",
			],
			filterableAttributes,
			sortableAttributes: [
				"price",
				"createdAt",
				"views",
				"boostedUntil",
				"_geo",
			],
		});
		configuredAttributes = filterableAttributes;
		console.log(
			`[search-indexer] meilisearch index "${INDEX_NAME}" configured with ${filterableAttributes.length} filterable attributes`,
		);
	} catch (error) {
		console.error(
			`[search-indexer] meilisearch failed to configure index "${INDEX_NAME}":`,
			error,
		);
		throw error;
	}
}

/**
 * Re-reads the categories periodically and updates the index settings when the
 * filterable attributes have changed.
 *
 * An attribute added in the admin is otherwise invisible to Meilisearch until
 * this worker restarts, and the symptom is not an error but a filter that
 * quietly matches nothing. One attempt per tick — the next tick is the retry.
 */
export function startFilterableAttributeRefresh(
	intervalMs = 15 * 60 * 1000,
): () => void {
	const timer = setInterval(() => {
		configureIndex(1, 0).catch((error) => {
			console.warn(
				"[search-indexer] filterable attribute refresh failed:",
				error instanceof Error ? error.message : error,
			);
		});
	}, intervalMs);

	// Never hold the process open on account of the refresh alone.
	timer.unref?.();

	return () => clearInterval(timer);
}

export async function clearIndex(): Promise<void> {
	const index = getIndex();
	try {
		await index.deleteAllDocuments();
		console.log(
			`[search-indexer] meilisearch cleared all documents from index "${INDEX_NAME}"`,
		);
	} catch (error) {
		console.error(
			`[search-indexer] meilisearch failed to clear index "${INDEX_NAME}":`,
			error,
		);
		throw error;
	}
}
