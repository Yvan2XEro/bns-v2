import config from "@payload-config";
import { MeiliSearch } from "meilisearch";
import type { Where } from "payload";
import { getPayload } from "payload";

const meiliConfigured = !!process.env.MEILI_HOST;
console.log(`[search] Meilisearch configured: ${meiliConfigured} (MEILI_HOST ${meiliConfigured ? "set" : "not set"} — will use ${meiliConfigured ? "Meilisearch" : "Payload fallback"})`);

export async function GET(request: Request) {
	const start = Date.now();
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("q") || "";
	const category = searchParams.get("category");
	const minPrice = searchParams.get("minPrice");
	const maxPrice = searchParams.get("maxPrice");
	const location = searchParams.get("location");
	const limit = Number.parseInt(searchParams.get("limit") || "20", 10);
	const offset = Number.parseInt(searchParams.get("offset") || "0", 10);

	const host = process.env.MEILI_HOST;
	const key = process.env.MEILI_MASTER_KEY;

	const dynamicFilters: string[] = [];
	for (const [key, value] of searchParams.entries()) {
		if (key.startsWith("attr_")) {
			const attrSlug = key.replace("attr_", "");
			const attrFilter = decodeURIComponent(value);

			if (attrFilter.startsWith(">=")) {
				dynamicFilters.push(
					`${attrSlug} >= ${Number.parseInt(attrFilter.replace(">=", ""), 10)}`,
				);
			} else if (attrFilter.startsWith("<=")) {
				dynamicFilters.push(
					`${attrSlug} <= ${Number.parseInt(attrFilter.replace("<=", ""), 10)}`,
				);
			} else if (attrFilter.startsWith(">")) {
				dynamicFilters.push(
					`${attrSlug} > ${Number.parseInt(attrFilter.replace(">", ""), 10)}`,
				);
			} else if (attrFilter.startsWith("<")) {
				dynamicFilters.push(
					`${attrSlug} < ${Number.parseInt(attrFilter.replace("<", ""), 10)}`,
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

	console.log(`[search] query="${query}" category=${category ?? "none"} filters=${dynamicFilters.length} limit=${limit} offset=${offset}`);

	if (!host) {
		console.log("[search] Using Payload (Meilisearch not configured)");
		const payload = await getPayload({ config });
		const where: Where = {
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
			const priceFilter: Record<string, number> = {};
			if (minPrice) priceFilter.greater_than = Number.parseInt(minPrice, 10);
			if (maxPrice) priceFilter.less_than = Number.parseInt(maxPrice, 10);
			where.price = priceFilter;
		}

		if (location) {
			where.location = { contains: location };
		}

		const result = await payload.find({
			collection: "listings",
			where,
			limit,
			page: Math.floor(offset / limit) + 1,
			sort: "-createdAt",
		});

		console.log(`[search] Payload returned ${result.totalDocs} results in ${Date.now() - start}ms`);
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
			offset,
		});
	}

	console.log("[search] Using Meilisearch");
	const client = new MeiliSearch({ host, apiKey: key });
	const index = client.index("listings");

	const filters: string[] = ["status = published"];

	if (category) {
		filters.push(`categoryId = "${category}"`);
	}

	if (minPrice) {
		filters.push(`price >= ${Number.parseInt(minPrice, 10)}`);
	}

	if (maxPrice) {
		filters.push(`price <= ${Number.parseInt(maxPrice, 10)}`);
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

	console.log(`[search] Meilisearch returned ${result.estimatedTotalHits ?? 0} results in ${Date.now() - start}ms`);
	return Response.json({
		hits: result.hits,
		total: result.estimatedTotalHits,
		limit,
		offset,
	});
}
