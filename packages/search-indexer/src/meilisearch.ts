import { MeiliSearch } from "meilisearch";

const MEILISEARCH_HOST =
	process.env.MEILISEARCH_HOST || "http://localhost:7700";
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || "";
const INDEX_NAME = "listings";

let client: MeiliSearch | null = null;

function getClient(): MeiliSearch {
	if (!client) {
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
	await index.addDocuments([doc], { primaryKey: "id" });
	console.log(`[meilisearch] Indexed listing ${doc.id}`);
}

export async function deleteDocument(id: string): Promise<void> {
	const index = getIndex();
	await index.deleteDocument(id);
	console.log(`[meilisearch] Deleted listing ${id}`);
}

export async function indexDocuments(docs: ListingDocument[]): Promise<void> {
	if (docs.length === 0) return;

	const index = getIndex();
	const BATCH_SIZE = 500;

	for (let i = 0; i < docs.length; i += BATCH_SIZE) {
		const batch = docs.slice(i, i + BATCH_SIZE);
		await index.addDocuments(batch, { primaryKey: "id" });
		console.log(
			`[meilisearch] Indexed batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} documents)`,
		);
	}
}

export async function configureIndex(): Promise<void> {
	const index = getIndex();

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

	console.log("[meilisearch] Index settings configured");
}

export async function clearIndex(): Promise<void> {
	const index = getIndex();
	await index.deleteAllDocuments();
	console.log("[meilisearch] All documents deleted");
}
