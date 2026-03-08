import { MeiliSearch } from "meilisearch";

const getMeiliClient = () => {
	const host = process.env.MEILI_HOST || "http://localhost:7700";
	const key = process.env.MEILI_MASTER_KEY || "";

	return new MeiliSearch({
		host,
		apiKey: key,
	});
};

export const syncListingToMeilisearch = async ({
	doc,
	operation,
	req,
}: {
	doc: Record<string, unknown>;
	operation: "create" | "update" | "delete";
	req: { payload: unknown };
}) => {
	const client = getMeiliClient();
	const index = client.index("listings");

	try {
		if (operation === "delete") {
			await index.deleteDocument(doc.id as string);
			return;
		}

		const payload = req.payload as {
			findByID: (options: {
				collection: string;
				id: string;
				depth: number;
			}) => Promise<Record<string, unknown>>;
		};

		const category = doc.category
			? await payload.findByID({
					collection: "categories",
					id: doc.category as string,
					depth: 0,
				})
			: null;

		const categoryAttributes =
			(category?.attributes as unknown as Array<{
				slug: string;
				filterable: boolean;
			}>) || [];

		const attributes = (doc.attributes as Record<string, unknown>) || {};

		const searchableAttributes: Record<string, unknown> = {
			id: doc.id,
			title: doc.title,
			description: doc.description,
			price: doc.price,
			location: doc.location,
			category: category?.name || null,
			categoryId: doc.category,
			status: doc.status,
			condition: doc.condition,
			boostedUntil: doc.boostedUntil,
			views: doc.views,
			images: doc.images,
			seller: doc.seller,
			createdAt: doc.createdAt,
			updatedAt: doc.updatedAt,
		};

		for (const attr of categoryAttributes) {
			if (attr.filterable && attributes[attr.slug] !== undefined) {
				searchableAttributes[attr.slug] = attributes[attr.slug];
			}
		}

		if (operation === "create" || operation === "update") {
			await index.addDocuments([searchableAttributes]);
		}
	} catch (error) {
		console.error("Meilisearch sync error:", error);
	}
};

export const configureMeilisearchIndex = async () => {
	const client = getMeiliClient();
	const index = client.index("listings");

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
			],
			sortableAttributes: ["price", "createdAt", "views", "boostedUntil"],
		});
	} catch (error) {
		console.error("Meilisearch configuration error:", error);
	}
};
