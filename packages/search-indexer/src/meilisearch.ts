import { MeiliSearch } from "meilisearch";

const MEILISEARCH_HOST =
	process.env.MEILISEARCH_HOST || "http://localhost:7700";
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || "";
const INDEX_NAME = "listings";

let client: MeiliSearch | null = null;

function getClient(): MeiliSearch {
	if (!client) {
		console.log(`[search-indexer] meilisearch connecting to ${MEILISEARCH_HOST}`);
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
		console.error(`[search-indexer] meilisearch failed to index listing ${doc.id}:`, error);
		throw error;
	}
}

export async function deleteDocument(id: string): Promise<void> {
	const index = getIndex();
	try {
		await index.deleteDocument(id);
		console.log(`[search-indexer] meilisearch deleted listing ${id}`);
	} catch (error) {
		console.error(`[search-indexer] meilisearch failed to delete listing ${id}:`, error);
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
			console.log(`[search-indexer] meilisearch indexed batch ${batchNum}/${totalBatches} (${batch.length} documents)`);
		} catch (error) {
			console.error(`[search-indexer] meilisearch failed on batch ${batchNum}/${totalBatches}:`, error);
			throw error;
		}
	}
}

export async function configureIndex(): Promise<void> {
	const index = getIndex();

	try {
		await index.updateSettings({
			searchableAttributes: ["title", "description", "location", "category"],
			filterableAttributes: [
				"status",
				"categoryId",
				"condition",
				"price",
				"location",
				"boostedUntil",
				"sellerId",
			],
			sortableAttributes: ["price", "createdAt", "views", "boostedUntil"],
		});
		console.log(`[search-indexer] meilisearch index "${INDEX_NAME}" configured`);
	} catch (error) {
		console.error(`[search-indexer] meilisearch failed to configure index "${INDEX_NAME}":`, error);
		throw error;
	}
}

export async function clearIndex(): Promise<void> {
	const index = getIndex();
	try {
		await index.deleteAllDocuments();
		console.log(`[search-indexer] meilisearch cleared all documents from index "${INDEX_NAME}"`);
	} catch (error) {
		console.error(`[search-indexer] meilisearch failed to clear index "${INDEX_NAME}":`, error);
		throw error;
	}
}
