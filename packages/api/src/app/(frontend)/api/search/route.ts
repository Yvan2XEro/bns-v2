import { MeiliSearch } from "meilisearch";
import { getPayload } from "payload";
import config from "../../../../payload.config";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("q") || "";
	const category = searchParams.get("category");
	const minPrice = searchParams.get("minPrice");
	const maxPrice = searchParams.get("maxPrice");
	const location = searchParams.get("location");
	const limit = parseInt(searchParams.get("limit") || "20");
	const offset = parseInt(searchParams.get("offset") || "0");

	const host = process.env.MEILI_HOST;
	const key = process.env.MEILI_MASTER_KEY;

	const dynamicFilters: string[] = [];
	for (const [key, value] of searchParams.entries()) {
		if (key.startsWith("attr_")) {
			const attrSlug = key.replace("attr_", "");
			const attrFilter = decodeURIComponent(value);

			if (attrFilter.startsWith(">=")) {
				dynamicFilters.push(
					`${attrSlug} >= ${parseInt(attrFilter.replace(">=", ""))}`,
				);
			} else if (attrFilter.startsWith("<=")) {
				dynamicFilters.push(
					`${attrSlug} <= ${parseInt(attrFilter.replace("<=", ""))}`,
				);
			} else if (attrFilter.startsWith(">")) {
				dynamicFilters.push(
					`${attrSlug} > ${parseInt(attrFilter.replace(">", ""))}`,
				);
			} else if (attrFilter.startsWith("<")) {
				dynamicFilters.push(
					`${attrSlug} < ${parseInt(attrFilter.replace("<", ""))}`,
				);
			} else if (attrFilter.includes(",")) {
				const options = attrFilter
					.split(",")
					.map((o) => `"${o.trim()}"`)
					.join(", ");
				dynamicFilters.push(`${attrSlug} IN [${options}]`);
			} else {
				dynamicFilters.push(`${attrSlug} = "${attrFilter}"`);
			}
		}
	}

	if (!host) {
		const payload = await getPayload({ config });
		const where: Record<string, unknown> = {
			status: { equals: "published" },
		};

		if (query) {
			where.or = [
				{ title: { contains: query } },
				{ description: { contains: query } },
			];
		}

		if (category) {
			where.category = { equals: category };
		}

		if (minPrice || maxPrice) {
			where.price = {};
			if (minPrice)
				(where.price as Record<string, number>).greater_than =
					parseInt(minPrice);
			if (maxPrice)
				(where.price as Record<string, number>).less_than = parseInt(maxPrice);
		}

		if (location) {
			where.location = { contains: location };
		}

		const result = await payload.find({
			collection: "listings",
			where,
			limit,
			offset,
			sort: "-createdAt",
		});

		return Response.json({
			hits: result.docs.map((doc: Record<string, unknown>) => ({
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
			offset,
		});
	}

	const client = new MeiliSearch({ host, apiKey: key });
	const index = client.index("listings");

	const filters: string[] = ["status = published"];

	if (category) {
		filters.push(`categoryId = "${category}"`);
	}

	if (minPrice) {
		filters.push(`price >= ${parseInt(minPrice)}`);
	}

	if (maxPrice) {
		filters.push(`price <= ${parseInt(maxPrice)}`);
	}

	if (location) {
		filters.push(`location = "${location}"`);
	}

	for (const dynamicFilter of dynamicFilters) {
		filters.push(dynamicFilter);
	}

	const result = await index.search(query, {
		filter: filters.join(" AND "),
		limit,
		offset,
	});

	return Response.json({
		hits: result.hits,
		total: result.estimatedTotalHits,
		limit,
		offset,
	});
}
