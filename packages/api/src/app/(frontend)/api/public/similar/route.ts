import config from "@payload-config";
import { MeiliSearch } from "meilisearch";
import type { Where } from "payload";
import { getPayload } from "payload";

const _meiliConfigured = !!process.env.MEILI_HOST;

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	const limit = Number.parseInt(searchParams.get("limit") || "6", 10);

	if (!id) {
		return Response.json({ error: "Missing id parameter" }, { status: 400 });
	}

	const payload = await getPayload({ config });

	// Fetch the listing to get its category
	const listing = await payload.findByID({
		collection: "listings",
		id,
	});

	if (!listing) {
		return Response.json({ error: "Listing not found" }, { status: 404 });
	}

	const categoryId =
		typeof listing.category === "object" && listing.category !== null
			? (listing.category as { id: string }).id
			: (listing.category as string);

	if (!categoryId) {
		return Response.json({ hits: [], total: 0, limit });
	}

	const host = process.env.MEILI_HOST;
	const key = process.env.MEILI_MASTER_KEY;

	if (!host) {
		// Payload fallback
		const where: Where = {
			status: { equals: "published" },
			category: { equals: categoryId },
			id: { not_equals: id },
		};

		const result = await payload.find({
			collection: "listings",
			where,
			limit,
			sort: "-createdAt",
		});

		return Response.json({
			hits: result.docs.map((doc) => ({
				id: doc.id,
				title: doc.title,
				description: doc.description,
				price: doc.price,
				location: doc.location,
				images: doc.images,
				status: doc.status,
				boostedUntil: doc.boostedUntil,
				attributes: doc.attributes,
				createdAt: doc.createdAt,
			})),
			total: result.totalDocs,
			limit,
		});
	}

	// Meilisearch path
	const client = new MeiliSearch({ host, apiKey: key });
	const index = client.index("listings");

	const filters: string[] = [
		"status = published",
		`categoryId = "${categoryId}"`,
	];

	const result = await index.search("", {
		filter: filters.join(" AND "),
		limit,
	});

	return Response.json({
		hits: result.hits,
		total: result.estimatedTotalHits,
		limit,
	});
}
