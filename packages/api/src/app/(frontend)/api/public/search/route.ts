import config from "@payload-config";
import { MeiliSearch } from "meilisearch";
import type { Where } from "payload";
import { getPayload } from "payload";
import { activeShopIds } from "@/lib/activeShopIds";
import { quoteFilterValue } from "@/lib/meiliFilter";
import { relationId } from "@/lib/relationId";
import { shopCapabilities } from "@/lib/shopCapabilities";

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
const asBoolean = (value: unknown): boolean | null =>
	typeof value === "boolean" ? value : null;

/**
 * Takes `unknown` so a caller passes its `Listing`/hit value straight through,
 * with no cast of its own — it accepts two shapes for the same fields:
 *
 * - The Payload path populates `doc.shop` as a full relation, carrying the
 *   shop's live `status`, so it re-checks it directly — the same rule
 *   `/s/{handle}` enforces by 404ing.
 * - The Meilisearch path indexes flat `shopId`/`shopHandle`/`shopName`/
 *   `shopLevel`/`priceMax`/`available` fields (`ListingDocument`) with no
 *   status to re-check here. The indexing rule (suspending unpublishes —
 *   pulling the listing out via its own `listing.updated` event; closing
 *   clears `shop` on the listing) keeps this path correct as long as every
 *   event lands, but the publish is fire-and-forget (`searchEvents.ts` drops
 *   a failed publish, no retry), so the caller batches a live status check
 *   over a page of hits behind this — see `blankStaleShops`.
 *
 * `available` is a purchasability boolean, not the exact unit count — see
 * `isProductAvailable` — the same spirit as `product-variants.available`, so
 * this route never reads or forwards a number for it.
 *
 * `orderable` is read the same way on both paths, straight off `doc.orderable`
 * — the Payload path's value is the listing's own `beforeRead` virtual
 * (lib/orderable.ts#isListingOrderable), and the Meilisearch path's is
 * `transformListing`'s copy of that same virtual, under the same key. There
 * is no second computation here to drift from either.
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
		available?: boolean | null;
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
		available: asBoolean(summary?.available) ?? asBoolean(doc.available),
		orderable: asBoolean(doc.orderable) ?? false,
	};
};

type ListingHit = ReturnType<typeof serializeListingHit>;

/**
 * The insurance behind the Meilisearch path's trust in its own shop fields:
 * one query for every distinct `shopId` a page of hits carries, and blank
 * the display fields of any shop that query does not confirm active —
 * exactly what the Payload path already gets for free from its populated
 * relation. Skipped entirely when the page carries no shop ids.
 */
async function blankStaleShops(hits: ListingHit[]): Promise<ListingHit[]> {
	const shopIds = Array.from(
		new Set(
			hits
				.map((hit) => hit.shopId)
				.filter((id): id is string => typeof id === "string"),
		),
	);
	if (shopIds.length === 0) return hits;

	const payload = await getPayload({ config });
	const active = await activeShopIds(payload, shopIds);
	return hits.map((hit) =>
		hit.shopId && !active.has(hit.shopId)
			? { ...hit, shopHandle: null, shopName: null, shopLevel: null }
			: hit,
	);
}

/**
 * `blankStaleShops` only clears a hit whose shop stopped being active; it
 * never corrects the level of one that is still active but was demoted, or
 * whose level lapsed, since the index was last written. `minShopLevel` is a
 * promise about the shop's *current* level, so it is re-checked here against
 * `shopCapabilities`'s effective level — never the indexed `shopLevel` a
 * stale document can carry — or a "verified shops only" search would
 * silently return an unverified one. One query per page of hits, same
 * shape as `blankStaleShops`.
 */
async function applyMinShopLevel(
	hits: ListingHit[],
	minShopLevel: number,
): Promise<ListingHit[]> {
	const shopIds = Array.from(
		new Set(
			hits
				.map((hit) => hit.shopId)
				.filter((id): id is string => typeof id === "string"),
		),
	);
	if (shopIds.length === 0) return [];

	const payload = await getPayload({ config });
	const result = await payload.find({
		collection: "shops",
		where: { id: { in: shopIds } },
		depth: 0,
		limit: 0,
		pagination: false,
	});
	const levels = new Map(
		result.docs.map((doc) => [
			String(doc.id),
			shopCapabilities(doc).effectiveLevel,
		]),
	);

	const filtered: ListingHit[] = [];
	for (const hit of hits) {
		if (typeof hit.shopId !== "string") continue;
		const level = levels.get(hit.shopId) ?? 0;
		if (level < minShopLevel) continue;
		filtered.push({ ...hit, shopLevel: level });
	}
	return filtered;
}

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
	// Clamped like the shops route: an unbounded limit reaches Meilisearch
	// directly, and now also sizes the live shop-status check's `in` filter.
	const limit = Math.min(
		50,
		Math.max(1, Number.parseInt(searchParams.get("limit") || "20", 10) || 20),
	);
	const offset = Number.parseInt(searchParams.get("offset") || "0", 10);
	const sortParam = searchParams.get("sort") || "newest";
	const boostedOnly = isTruthyQueryParam(searchParams.get("boosted"));
	const orderableOnly = isTruthyQueryParam(searchParams.get("orderable"));
	const conditionParam = searchParams.get("condition");
	const tagsParam = searchParams.get("tags");
	const shopParam = searchParams.get("shop");
	const minShopLevelParam = Number.parseInt(
		searchParams.get("minShopLevel") ?? "",
		10,
	);
	const minShopLevel =
		minShopLevelParam >= 1 && minShopLevelParam <= 3 ? minShopLevelParam : null;
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

	if (minShopLevel) {
		filters.push(`shopLevel >= ${minShopLevel}`);
	}

	// `orderable` has no non-default meaning other than "true": the same
	// `isTruthyQueryParam` gate `boosted` uses, so `orderable=false` or any
	// other value leaves the filter off rather than asking Meilisearch to
	// exclude anything. There is no Payload-fallback equivalent (same gap as
	// `minShopLevel` above) — `orderable` is a search-index-only filter.
	if (orderableOnly) {
		filters.push("orderable = true");
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
	const hits = result.hits.map((hit: unknown) => serializeListingHit(hit));

	try {
		// Same shape as the Payload path — `serializeListingHit` reads the
		// indexer's flat `shopId`/`shopHandle`/`shopName`/`shopLevel`/`priceMax`/
		// `available` fields for a Meilisearch hit, and `blankStaleShops`
		// re-checks each one against a shop the index might not know is gone.
		const hydrated = await blankStaleShops(hits);
		// The Meilisearch filter above ran against the *indexed* `shopLevel`,
		// which can lag a demotion or suspension — re-apply the floor against
		// the live, capability-derived level so a stale document never passes
		// a `minShopLevel` search it no longer qualifies for.
		const filtered = minShopLevel
			? await applyMinShopLevel(hydrated, minShopLevel)
			: hydrated;
		return Response.json({
			hits: filtered,
			total: result.estimatedTotalHits,
			limit,
			offset,
		});
	} catch (error) {
		// The live check hits the database, not Meilisearch — a search that
		// otherwise succeeded should not 500 because of it. Degrade the way a
		// Meilisearch failure already does for the shop filter: fail safe to
		// the Payload path instead, same as the sibling shops route does
		// unconditionally for its own live check.
		console.error("[search] Live shop status check failed", error);
		return runPayloadListingSearch(fallbackParams);
	}
}
