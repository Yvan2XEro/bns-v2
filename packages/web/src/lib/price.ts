export function hasListingPrice(
	price: number | null | undefined,
): price is number {
	return typeof price === "number" && Number.isFinite(price);
}

export function formatListingPrice(
	price: number | null | undefined,
	locale = "fr-FR",
): string | null {
	if (!hasListingPrice(price)) return null;
	return price.toLocaleString(locale);
}
