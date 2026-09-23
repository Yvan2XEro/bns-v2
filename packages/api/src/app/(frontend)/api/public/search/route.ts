import config from "@payload-config";
import { MeiliSearch } from "meilisearch";
import type { Where } from "payload";
import { getPayload } from "payload";
import { quoteFilterValue } from "@/lib/meiliFilter";
import { relationId } from "@/lib/relationId";

const meiliConfigured = !!process.env.MEILI_HOST;
console.log(
	`[search] Meilisearch configured: ${meiliConfigured} (MEILI_HOST ${meiliConfigured ? "set" : "not set"} — will use ${meiliConfigured ? "Meilisearch" : "Payload fallback"})`,
);

const isTruthyQueryParam = (value: string | null): boolean =>
	value === "true" || value === "1";

/**
 * Turns one `attr_<slug>=<value>` parameter into a filter clause, or `null`
 * when the value does not describe one.
 *
 * A leading comparison operator means a numeric bound; a comma means "any of
 * these"; anything else is an exact match. A bound that is not a number is
 * dropped rather than sent as `NaN`, which Meilisearch rejects outright.
 */
function buildAttributeFilter(slug: string, raw: string): string | null {
	const value = raw.trim();
	if (!value) return null;

	for (const operator of [">=", "<=", ">", "<"] as const) {
		if (!value.startsWith(operator)) continue;
		const bound = Number(value.slice(operator.length).trim());
		return Number.isFinite(bound) ? `${slug} ${operator} ${bound}` : null;
	}

	if (value.includes(",")) {
		const options = value
			.split(",")
			.map((option) => option.trim())
			.filter(Boolean)
			.map(quoteFilterValue);
		return options.length > 0 ? `${slug} IN [${options.join(", ")}]` : null;
	}

	return `${slug} = ${quoteFilterValue(value)}`;
}

const asString = (value: unknown): string | null =>
	typeof value === "string" ? value : null;
const asNumber = (value: unknown): number | null =>
	typeof value === "number" ? value : null;

/**
 * Takes `unknown` so a caller passes its `Listing`/hit value straight through,
 * with no cast of its own — it accepts two shapes for the same fields:
 *
 * - The Payload path populates `doc.shop` as a full relation, carrying the
 *   shop's live `status`, so it re-checks it directly — the same rule
 *   `/s/{handle}` enforces by 404ing.
 * - The Meilisearch path indexes flat `shopId`/`shopHandle`/`shopName`/
 *   `shopLevel`/`priceMax`/`available` fields (`ListingDocument`) with no
 *   status to re-check. That is safe because a listing can only carry a
 *   stale shop association when the shop is suspended — `moderation.
 *   suspendShop` unpublishes every one of its listings in the same
 *   transaction that flips the shop's status, which pulls the listing
 *   document out of the index via its own `listing.updated` event. Closing a
 *   shop (`shopListings.closeShop`) instead clears `shop` on each listing, so
 *   a closed shop leaves no shop fields on the index at all.
 */
const serializeListingHit = (input: unknown) => {
	const doc = (input ?? {}) as Record<string, unknown>;
	const shop =
		doc.shop && typeof doc.shop === "object"
			? (doc.shop as Record<string, unknown>)
			: null;
	const activeShop = shop && shop.status === "active" ? shop : null;
	const summary = (doc.productSummary ?? null) as {
		priceMax?: number | null;
		available?: number | null;
	} | null;
	return {
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
		shopId: relationId(doc.shop) ?? asString(doc.shopId),
		shopHandle: asString(activeShop?.handle) ?? asString(doc.shopHandle),
		shopName: asString(activeShop?.name) ?? asString(doc.shopName),
		shopLevel: asNumber(activeShop?.level) ?? asNumber(doc.shopLevel),
		priceMax: asNumber(summary?.priceMax) ?? asNumber(doc.priceMax),
		available: asNumber(summary?.available) ?? asNumber(doc.available),
	};
};

interface FallbackParams {
	query: string;
	category: string | null;
	shopParam: string | null;
	minPrice: string | null;
	maxPrice: string | null;
	location: string | null;
	conditionParam: string | null;
	boostedOnly: boolean;
	sortParam: string;
	limit: number;
	offset: number;
	nowIso: string;
}

/**
 * The Payload path: source of truth for every filter, including `shop`,
 * which only this path can enforce against the shop's own status (Shops'
 * read access already answers "not found" for a suspended or closed shop to
 * an anonymous caller, so reusing it here is cheaper and safer than
 * re-deriving the rule). Shared by the two callers below so a page computed
 * from `offset` always means the same thing in both.
 */
async function runPayloadListingSearch(
	params: FallbackParams,
): Promise<Response> {
	const {
		query,
		category,
		shopParam,
		minPrice,
		maxPrice,
		location,
		conditionParam,
		boostedOnly,
		sortParam,
		limit,
		offset,
		nowIso,
	} = params;
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

	if (shopParam) {
		const shops = await payload.find({
			collection: "shops",
			where: { id: { equals: shopParam } },
			depth: 0,
			limit: 1,
		});
		if (!shops.docs[0]) {
			return Response.json({ hits: [], total: 0, limit, offset });
		}
		where.shop = { equals: shopParam };
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
		hits: result.docs.map((doc) => serializeListingHit(doc)),
		total: result.totalDocs,
		limit,
		offset,
	});
}

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
	const shopParam = searchParams.get("shop");
	const nowIso = new Date().toISOString();

	const host = process.env.MEILI_HOST;
	const key = process.env.MEILI_MASTER_KEY;

	const fallbackParams: FallbackParams = {
		query,
		category,
		shopParam,
		minPrice,
		maxPrice,
		location,
		conditionParam,
		boostedOnly,
		sortParam,
		limit,
		offset,
		nowIso,
	};

	const dynamicFilters: string[] = [];
	for (const [key, value] of searchParams.entries()) {
		if (!key.startsWith("attr_")) continue;

		const attrSlug = key.slice("attr_".length);
		// Attribute slugs are generated, lowercase and hyphenated. Anything else
		// is not one of ours and has no business reaching the filter expression.
		if (!/^[a-z0-9][a-z0-9-]*$/.test(attrSlug)) continue;

		const built = buildAttributeFilter(attrSlug, value);
		if (built) dynamicFilters.push(built);
	}

	if (!host || boostedOnly) {
		return runPayloadListingSearch(fallbackParams);
	}

	console.log("[search] Using Meilisearch");
	const client = new MeiliSearch({ host, apiKey: key });
	const index = client.index("listings");

	const filters: string[] = ["status = published"];

	if (category) {
		filters.push(`categoryId = ${quoteFilterValue(category)}`);
	}

	if (shopParam) {
		filters.push(`shopId = ${quoteFilterValue(shopParam)}`);
	}

	if (minPrice) {
		filters.push(`price >= ${Number.parseInt(minPrice, 10)}`);
	}

	if (maxPrice) {
		filters.push(`price <= ${Number.parseInt(maxPrice, 10)}`);
	}

	if (location) {
		filters.push(`location = ${quoteFilterValue(location)}`);
	}

	if (conditionParam) {
		const conditions = conditionParam
			.split(",")
			.map((c) => c.trim())
			.filter(Boolean);
		if (conditions.length > 0) {
			const conditionList = conditions.map(quoteFilterValue).join(", ");
			filters.push(`condition IN [${conditionList}]`);
		}
	}

	if (tagsParam) {
		const tagSlugs = tagsParam
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		if (tagSlugs.length > 0) {
			const tagList = tagSlugs.map(quoteFilterValue).join(", ");
			filters.push(`tags IN [${tagList}]`);
		}
	}

	if (boostedOnly) {
		filters.push(`boostedUntil > ${quoteFilterValue(nowIso)}`);
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

	const filter = filters.join(" AND ");

	let result: Awaited<ReturnType<typeof index.search>>;
	try {
		result = await index.search(query, {
			filter,
			sort: sort.length > 0 ? sort : undefined,
			limit,
			offset,
		});
	} catch (error) {
		// Meilisearch rejects a filter on an attribute it was never told is
		// filterable, and the index settings are only as fresh as the last run of
		// the indexer's `configureIndex`. That used to surface as a bare 500 with
		// no clue as to which filter caused it.
		console.error(
			`[search] Meilisearch rejected the query. filter=${filter} sort=${sort.join(",")}`,
			error,
		);
		if (shopParam) {
			// `shopId` is filterable, but an index a deploy has not yet reconfigured
			// (or a shop-filtered query Meilisearch otherwise refuses) should not
			// take every other search down with a 503 — fail safe to the Payload
			// path instead.
			return runPayloadListingSearch(fallbackParams);
		}
		return Response.json(
			{ error: "Search is unavailable", code: "search.unavailable" },
			{ status: 503 },
		);
	}

	console.log(
		`[search] Meilisearch returned ${result.estimatedTotalHits ?? 0} results in ${Date.now() - start}ms`,
	);
	return Response.json({
		// Same shape as the Payload path — `serializeListingHit` reads the
		// indexer's flat `shopId`/`shopHandle`/`shopName`/`shopLevel`/`priceMax`/
		// `available` fields for a Meilisearch hit.
		hits: result.hits.map((hit: unknown) => serializeListingHit(hit)),
		total: result.estimatedTotalHits,
		limit,
		offset,
	});
}
