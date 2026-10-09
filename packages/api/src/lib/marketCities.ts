import type { Payload } from "payload";
export type { MarketCity } from "../contracts/marketCity";
import type { MarketCity } from "../contracts/marketCity";

const CACHE_TTL_MS = 60_000;
type Entry = { at: number; cities: MarketCity[] };
const caches = new WeakMap<object, Map<string, Entry>>();

export function invalidateMarketCities(payload: object): void {
	caches.delete(payload);
}

const relId = (value: unknown): string =>
	value !== null && typeof value === "object" && "id" in value
		? String((value as { id: unknown }).id)
		: String(value);

function toCity(row: Record<string, unknown>): MarketCity | null {
	if (typeof row.key !== "string" || typeof row.label !== "string") return null;
	const fee = row.defaultDeliveryFee;
	if (typeof fee !== "number" || !Number.isInteger(fee) || fee < 0) return null;
	const districts = (Array.isArray(row.districts) ? row.districts : []).flatMap(
		(d: unknown) => {
			const slug = (d as { slug?: unknown } | null)?.slug;
			const label = (d as { label?: unknown } | null)?.label;
			return typeof slug === "string" && typeof label === "string"
				? [{ slug, label }]
				: [];
		},
	);
	return {
		id: String(row.id),
		market: relId(row.market),
		key: row.key,
		label: row.label,
		defaultDeliveryFee: fee,
		districts,
		active: row.active !== false,
		sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
	};
}

const bySortOrder = (a: MarketCity, b: MarketCity) =>
	a.sortOrder - b.sortOrder || a.key.localeCompare(b.key);

/** Active rows of one market, sorted, cached 60 s per payload instance. */
export async function getMarketCities(
	payload: Payload,
	market: { id: string },
): Promise<MarketCity[]> {
	const marketId = String(market.id);
	let perPayload = caches.get(payload);
	if (!perPayload) {
		perPayload = new Map();
		caches.set(payload, perPayload);
	}
	const hit = perPayload.get(marketId);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.cities;
	const { docs } = await payload.find({
		collection: "market-cities",
		where: {
			and: [{ market: { equals: marketId } }, { active: { equals: true } }],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const cities = docs
		.flatMap((doc: unknown) => toCity(doc as Record<string, unknown>) ?? [])
		.sort(bySortOrder);
	perPayload.set(marketId, { at: Date.now(), cities });
	return cities;
}

/**
 * The market a shop belongs to, through its city row: the shop's own city,
 * else one of its locations'. Inactive rows still resolve (a deactivated city
 * refuses new orders, it does not orphan its shops); null when nothing does.
 */
export async function marketOfShopCity(
	payload: Payload,
	shop: { id: unknown; location?: { city?: string | null } | null },
): Promise<{ id: string } | null> {
	const keys: string[] = [];
	if (shop.location?.city) keys.push(shop.location.city);
	if (keys.length === 0) {
		const locations = await payload.find({
			collection: "shop-locations",
			where: { shop: { equals: shop.id } },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		for (const location of locations.docs)
			if (typeof location.city === "string") keys.push(location.city);
	}
	if (keys.length === 0) return null;
	const { docs } = await payload.find({
		collection: "market-cities",
		where: { key: { in: keys } },
		limit: 1,
		sort: "key",
		depth: 0,
		overrideAccess: true,
	});
	const first = docs[0];
	return first ? { id: relId(first.market) } : null;
}

/** The active cities of the shop's own market; empty when it has none. */
export async function getShopMarketCities(
	payload: Payload,
	shop: Parameters<typeof marketOfShopCity>[1],
): Promise<MarketCity[]> {
	const market = await marketOfShopCity(payload, shop);
	return market ? getMarketCities(payload, market) : [];
}

const cityOf = (cities: readonly MarketCity[], key: string) =>
	cities.find((city) => city.key === key);

export function isMarketCityKey(
	cities: readonly MarketCity[],
	key: unknown,
): key is string {
	return typeof key === "string" && cityOf(cities, key) !== undefined;
}

/** `{city}.other` is always accepted; it carries a free-text `districtOther`. */
export function isMarketDistrictKey(
	cities: readonly MarketCity[],
	cityKey: string,
	districtKey: string,
): boolean {
	const city = cityOf(cities, cityKey);
	if (!city) return false;
	return (
		districtKey === `${cityKey}.other` ||
		city.districts.some((d) => `${cityKey}.${d.slug}` === districtKey)
	);
}

export function districtLabelOf(
	cities: readonly MarketCity[],
	key: string,
): string | null {
	const dot = key.indexOf(".");
	if (dot < 1) return null;
	const city = cityOf(cities, key.slice(0, dot));
	if (!city) return null;
	if (key === `${city.key}.other`) return "Autre";
	return (
		city.districts.find((d) => `${city.key}.${d.slug}` === key)?.label ?? null
	);
}

export function defaultFeeOf(
	cities: readonly MarketCity[],
	cityKey: string,
): number | null {
	return cityOf(cities, cityKey)?.defaultDeliveryFee ?? null;
}
