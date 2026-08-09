import config from "@payload-config";
import { MeiliSearch } from "meilisearch";
import type { Where } from "payload";
import { getPayload } from "payload";

const meiliConfigured = !!process.env.MEILI_HOST;
console.log(
	`[search] Meilisearch configured: ${meiliConfigured} (MEILI_HOST ${meiliConfigured ? "set" : "not set"} — will use ${meiliConfigured ? "Meilisearch" : "Payload fallback"})`,
);

const isTruthyQueryParam = (value: string | null): boolean =>
	value === "true" || value === "1";

const serializeListingHit = (doc: Record<string, unknown>) => ({
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
});

export async function GET(request: Request) {
	const start = Date.now();
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("q") || "";
	const category = searchParams.get("category");
	const minPrice = searchParams.get("minPrice");
	const maxPrice = searchParams.get("maxPrice");
	const location = searchParams.get("location");
	const lat = searchParams.get("lat");
	const lng = searchParams.get("lng");
	const radius = Number.parseInt(searchParams.get("radius") || "50", 10);
	const limit = Number.parseInt(searchParams.get("limit") || "20", 10);
	const offset = Number.parseInt(searchParams.get("offset") || "0", 10);
	const sortParam = searchParams.get("sort") || "newest";
	const boostedOnly = isTruthyQueryParam(searchParams.get("boosted"));
	const conditionParam = searchParams.get("condition");
	const tagsParam = searchParams.get("tags");
	const nowIso = new Date().toISOString();

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

	if (!host || boostedOnly) {
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

		if (conditionParam) {
			const conditions = conditionParam
				.split(",")
				.map((c) => c.trim())
				.filter(Boolean);
			if (conditions.length > 0) {
				where.condition = { in: conditions };
			}
		}

		if (boostedOnly) {
			where.boostedUntil = { greater_than: nowIso };
		}

		let payloadSort: string;
		switch (sortParam) {
			case "oldest":
				payloadSort = "createdAt";
				break;
			case "price_asc":
				payloadSort = "price";
				break;
			case "price_desc":
				payloadSort = "-price";
				break;
			case "boosted":
				payloadSort = "-boostedUntil";
				break;
			default:
				payloadSort = boostedOnly ? "-boostedUntil" : "-createdAt";
				break;
		}

		const result = await payload.find({
			collection: "listings",
			where,
			limit,
			page: Math.floor(offset / limit) + 1,
			sort: payloadSort,
		});

		return Response.json({
			hits: result.docs.map((doc) =>
				serializeListingHit(doc as unknown as Record<string, unknown>),
			),
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

	if (conditionParam) {
		const conditions = conditionParam
			.split(",")
			.map((c) => c.trim())
			.filter(Boolean);
		if (conditions.length > 0) {
			const conditionList = conditions.map((c) => `"${c}"`).join(", ");
			filters.push(`condition IN [${conditionList}]`);
		}
	}

	if (tagsParam) {
		const tagSlugs = tagsParam
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		if (tagSlugs.length > 0) {
			const tagList = tagSlugs.map((s) => `"${s}"`).join(", ");
			filters.push(`tags IN [${tagList}]`);
		}
	}

	if (boostedOnly) {
		filters.push(`boostedUntil > "${nowIso}"`);
	}

	for (const dynamicFilter of dynamicFilters) {
		filters.push(dynamicFilter);
	}

	if (lat && lng) {
		filters.push(
			`_geoRadius(${Number.parseFloat(lat)}, ${Number.parseFloat(lng)}, ${radius * 1000})`,
		);
	}

	const sort: string[] = [];
	if (lat && lng) {
		sort.push(
			`_geoPoint(${Number.parseFloat(lat)}, ${Number.parseFloat(lng)}):asc`,
		);
	}

	switch (sortParam) {
		case "oldest":
			sort.push("createdAt:asc");
			break;
		case "price_asc":
			sort.push("price:asc");
			break;
		case "price_desc":
			sort.push("price:desc");
			break;
		case "boosted":
			sort.push("boostedUntil:desc");
			sort.push("createdAt:desc");
			break;
		default:
			if (boostedOnly) {
				sort.push("boostedUntil:desc");
				sort.push("createdAt:desc");
			} else {
				sort.push("createdAt:desc");
			}
			break;
	}

	const result = await index.search(query, {
		filter: filters.join(" AND "),
		sort: sort.length > 0 ? sort : undefined,
		limit,
		offset,
	});

	console.log(
		`[search] Meilisearch returned ${result.estimatedTotalHits ?? 0} results in ${Date.now() - start}ms`,
	);
	return Response.json({
		hits: result.hits,
		total: result.estimatedTotalHits,
		limit,
		offset,
	});
}
