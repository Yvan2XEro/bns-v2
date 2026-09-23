import config from "@payload-config";
import { MeiliSearch } from "meilisearch";
import { getPayload, type Where } from "payload";
import { quoteFilterValue } from "@/lib/meiliFilter";
import { toShopSearchHit } from "@/lib/publicShop";

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

	const host = process.env.MEILI_HOST;
	if (!host) {
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
			hits: result.docs.map((doc) =>
				toShopSearchHit(doc as unknown as Record<string, unknown>),
			),
			total: result.totalDocs,
			limit,
			offset,
		});
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
			hits: result.hits.map((hit) =>
				toShopSearchHit(hit as Record<string, unknown>),
			),
			total: result.estimatedTotalHits ?? result.hits.length,
			limit,
			offset,
		});
	} catch (error) {
		console.error(
			`[search:shops] Meilisearch rejected the query. filter=${filters.join(" AND ")}`,
			error,
		);
		return Response.json(
			{ error: "Search is unavailable", code: "search.unavailable" },
			{ status: 503 },
		);
	}
}
