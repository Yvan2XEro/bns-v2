import config from "@payload-config";
import { MeiliSearch } from "meilisearch";
import { getPayload } from "payload";
import {
	CATEGORY_COUNTS_TTL_MS,
	type CategoryCounts,
	rollUpCounts,
} from "@/contracts/categoryCounts";
import { foldLocation } from "@/lib/locationKeys";
import { locationFilter, quoteFilterValue } from "@/lib/meiliFilter";
import { relationId } from "@/lib/relationId";

const cache = new Map<string, { at: number; body: CategoryCounts }>();

const headers = {
	"Cache-Control": `public, max-age=600, s-maxage=${CATEGORY_COUNTS_TTL_MS / 1000}`,
};

async function countInCity(city: string): Promise<CategoryCounts> {
	const host = process.env.MEILI_HOST;
	// No search engine (local dev): no counts, the menus keep their order.
	if (!host) return { city, total: 0, counts: {} };
	const index = new MeiliSearch({
		host,
		apiKey: process.env.MEILI_MASTER_KEY,
	}).index("listings");
	const run = (where: string) =>
		index.search("", {
			filter: `status = published AND ${where}`,
			facets: ["categoryId"],
			limit: 0,
		});
	const result = await run(locationFilter(city)).catch(
		// An index not yet reconfigured refuses `locationKeys`.
		() => run(`location = ${quoteFilterValue(city)}`),
	);
	const direct = (result.facetDistribution?.categoryId ?? {}) as Record<
		string,
		number
	>;

	const payload = await getPayload({ config });
	const categories = await payload.find({
		collection: "categories",
		depth: 0,
		limit: 0,
		pagination: false,
		select: { parent: true },
		overrideAccess: true,
	});
	const parentOf = new Map(
		categories.docs.map(
			(c) => [String(c.id), relationId(c.parent) ?? null] as const,
		),
	);
	return {
		city,
		total: result.estimatedTotalHits ?? 0,
		counts: rollUpCounts(direct, parentOf),
	};
}

/**
 * GET /api/public/categories/counts?city=Douala — published listings per
 * category in a city, sub-categories rolled up into their parents: what the
 * menus order the categories by. Kept for hours (CATEGORY_COUNTS_TTL_MS) so
 * a menu does not reshuffle from one visit to the next.
 */
export async function GET(request: Request) {
	const city = new URL(request.url).searchParams.get("city")?.trim() ?? "";
	if (!city || city.length > 80) {
		return Response.json(
			{ error: "city is required", code: "categories.city_required" },
			{ status: 400 },
		);
	}
	const key = foldLocation(city) || city.toLowerCase();
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < CATEGORY_COUNTS_TTL_MS) {
		return Response.json({ ...hit.body, city }, { headers });
	}
	try {
		const body = await countInCity(city);
		cache.set(key, { at: Date.now(), body });
		return Response.json(body, { headers });
	} catch (error) {
		console.error("[categories/counts] counting failed", error);
		// The menus fall back to their editorial order.
		return Response.json({
			city,
			total: 0,
			counts: {},
		} satisfies CategoryCounts);
	}
}
