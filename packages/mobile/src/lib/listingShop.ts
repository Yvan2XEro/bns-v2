/**
 * The shop name for a listing card: a search hit flattens `shopName` onto
 * the listing (the API's search route), while a Payload doc only carries
 * the populated `shop` relation (`{ name, handle, … }` at depth ≥ 1). Reads
 * whichever is present, guarding — not casting — against either field
 * being absent or of the wrong runtime type.
 */
export function listingShopName(listing: unknown): string | null {
	const record = asRecord(listing);
	if (!record) return null;

	const flat = asString(record.shopName);
	if (flat) return flat;

	const shop = asRecord(record.shop);
	return shop ? asString(shop.name) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}
