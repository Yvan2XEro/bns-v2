import config from "@payload-config";
import { MeiliSearch } from "meilisearch";
import { getPayload, type Where } from "payload";
import { quoteFilterValue } from "@/lib/meiliFilter";
import { toShopSearchHit } from "@/lib/publicShop";

interface ShopSearchParams {
	q: string;
	city: string | null;
	category: string | null;
	limit: number;
	offset: number;
}

/**
 * The Payload path, which already enforces the active-shop rule through
 * Shops' own read access. Shared by the two callers below so a Meilisearch
 * failure falls back to exactly what an unconfigured host would have
 * answered.
 */
async function runPayloadShopSearch(
	params: ShopSearchParams,
): Promise<Response> {
	const { q, city, category, limit, offset } = params;
	const payload = await getPayload({ config });
	const and: Where[] = [{ status: { equals: "active" } }];
	if (q) {
		and.push({
			or: [
				{ name: { contains: q } },
				{ handle: { contains: q.toLowerCase() } },
				{ description: { contains: q } },
			],
		});
	}
	if (city) and.push({ "location.city": { equals: city } });
	if (category) and.push({ categories: { in: [category] } });
	const result = await payload.find({
		collection: "shops",
		where: { and },
		depth: 1,
		limit,
		page: Math.floor(offset / limit) + 1,
		sort: "-publishedListingCount",
	});
	return Response.json({
		hits: result.docs.map((doc) => toShopSearchHit(doc)),
		total: result.totalDocs,
		limit,
		offset,
	});
}

export async function GET(request: Request) {
	const search = new URL(request.url).searchParams;
	const q = search.get("q")?.trim() ?? "";
	const city = search.get("city")?.trim() || null;
	const category = search.get("category")?.trim() || null;
	const limit = Math.min(
		50,
		Math.max(1, Number.parseInt(search.get("limit") ?? "20", 10) || 20),
	);
	const offset = Math.max(
		0,
		Number.parseInt(search.get("offset") ?? "0", 10) || 0,
	);
	const params: ShopSearchParams = { q, city, category, limit, offset };

	const host = process.env.MEILI_HOST;
	if (!host) {
		return runPayloadShopSearch(params);
	}

	const filters: string[] = [];
	if (city) filters.push(`city = ${quoteFilterValue(city)}`);
	if (category) filters.push(`categoryIds = ${quoteFilterValue(category)}`);

	try {
		const index = new MeiliSearch({
			host,
			apiKey: process.env.MEILI_MASTER_KEY,
		}).index("shops");
		const result = await index.search(q, {
			filter: filters.length ? filters.join(" AND ") : undefined,
			sort: q ? undefined : ["publishedListingCount:desc"],
			limit,
			offset,
		});
		return Response.json({
			hits: result.hits.map((hit) => toShopSearchHit(hit)),
			total: result.estimatedTotalHits ?? result.hits.length,
			limit,
			offset,
		});
	} catch (error) {
		// Nothing creates the `shops` index yet (Task 14's job), so with
		// MEILI_HOST set this always lands here today. Fail safe to the
		// Payload path instead of 503ing the whole route; once Task 14 builds
		// the index, this query simply stops throwing.
		console.error(
			`[search:shops] Meilisearch rejected the query. filter=${filters.join(" AND ")}`,
			error,
		);
		return runPayloadShopSearch(params);
	}
}
