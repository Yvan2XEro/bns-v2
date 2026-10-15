import config from "@payload-config";
import { MeiliSearch } from "meilisearch";
import { getPayload, type Where } from "payload";
import { categoryWithDescendants } from "@/lib/categoryDescendants";
import { quoteFilterValue } from "@/lib/meiliFilter";
import { type ShopSearchHit, toShopSearchHit } from "@/lib/publicShop";
import { shopCapabilities } from "@/lib/shopCapabilities";
import {
	liveShopHits,
	MAX_SHOP_PREVIEWS,
	withShopPreviews,
} from "@/lib/shopSearchCards";

type ShopSort = "relevance" | "products" | "newest";

interface ShopSearchParams {
	q: string;
	city: string | null;
	/** The category and its descendants. */
	categoryIds: string[] | null;
	minShopLevel: number | null;
	sort: ShopSort;
	previews: number;
	limit: number;
	offset: number;
}

function parseSort(value: string | null): ShopSort {
	return value === "products" || value === "newest" ? value : "relevance";
}

async function finishHits(
	hits: ShopSearchHit[],
	previews: number,
): Promise<ShopSearchHit[]> {
	if (previews === 0 || hits.length === 0) return hits;
	return withShopPreviews(await getPayload({ config }), hits, previews);
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
	const { q, city, categoryIds, minShopLevel, sort, previews, limit, offset } =
		params;
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
	if (categoryIds) and.push({ categories: { in: categoryIds } });
	if (minShopLevel) and.push({ level: { greater_than_equal: minShopLevel } });
	const result = await payload.find({
		collection: "shops",
		where: { and },
		depth: 1,
		limit,
		page: Math.floor(offset / limit) + 1,
		sort: sort === "newest" ? "-createdAt" : "-publishedListingCount",
	});
	// The stored level can outlive its expiry; the badge floor is the effective one.
	const docs = minShopLevel
		? result.docs.filter(
				(doc) => shopCapabilities(doc).effectiveLevel >= minShopLevel,
			)
		: result.docs;
	return Response.json({
		hits: await finishHits(
			docs.map((doc) => toShopSearchHit(doc)),
			previews,
		),
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
	const minShopLevelParam = Number.parseInt(
		search.get("minShopLevel") ?? "",
		10,
	);
	const minShopLevel =
		minShopLevelParam >= 1 && minShopLevelParam <= 3 ? minShopLevelParam : null;
	const sort = parseSort(search.get("sort"));
	const previews = Math.min(
		MAX_SHOP_PREVIEWS,
		Math.max(0, Number.parseInt(search.get("previews") ?? "0", 10) || 0),
	);
	const categoryIds = category
		? await categoryWithDescendants(await getPayload({ config }), category)
		: null;
	const params: ShopSearchParams = {
		q,
		city,
		categoryIds,
		minShopLevel,
		sort,
		previews,
		limit,
		offset,
	};

	const host = process.env.MEILI_HOST;
	if (!host) {
		return runPayloadShopSearch(params);
	}

	const filters: string[] = [];
	if (city) filters.push(`city = ${quoteFilterValue(city)}`);
	if (categoryIds) {
		filters.push(
			categoryIds.length > 1
				? `categoryIds IN [${categoryIds.map(quoteFilterValue).join(", ")}]`
				: `categoryIds = ${quoteFilterValue(categoryIds[0])}`,
		);
	}
	if (minShopLevel) filters.push(`level >= ${minShopLevel}`);

	try {
		const index = new MeiliSearch({
			host,
			apiKey: process.env.MEILI_MASTER_KEY,
		}).index("shops");
		const result = await index.search(q, {
			filter: filters.length ? filters.join(" AND ") : undefined,
			sort:
				sort === "newest"
					? ["createdAt:desc"]
					: sort === "products" || !q
						? ["publishedListingCount:desc"]
						: undefined,
			limit,
			offset,
		});

		// The same insurance as the listing route: a lost `shop.*` publish can
		// leave a suspended or closed shop's document in the index (nothing
		// retries a dropped publish, and the bulk reindex runs on no schedule),
		// so a page of hits gets one live status check before it goes out —
		// dropped here rather than blanked, since the hit *is* the shop record.
		// The same read re-applies `minShopLevel` against the live level.
		const hits = await liveShopHits(
			await getPayload({ config }),
			result.hits.map((hit) => toShopSearchHit(hit)),
			minShopLevel,
		);

		return Response.json({
			hits: await finishHits(hits, previews),
			total: result.estimatedTotalHits ?? result.hits.length,
			limit,
			offset,
		});
	} catch (error) {
		// The `shops` index can be missing (a deploy that has not run the
		// indexer's reindex yet) or reject the query outright. Fail safe to the
		// Payload path instead of 503ing the whole route.
		console.error(
			`[search:shops] Meilisearch rejected the query. filter=${filters.join(" AND ")}`,
			error,
		);
		return runPayloadShopSearch(params);
	}
}
