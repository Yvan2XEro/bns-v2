/** Integer XAF amounts, formatted the way the mockups print them: "285 000 XAF". */
export function formatXaf(
	amount: number | null | undefined,
	locale = "fr-FR",
): string {
	if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
	return `${Math.round(amount).toLocaleString(locale)} XAF`;
}

export function formatXafRange(
	min: number | null | undefined,
	max: number | null | undefined,
	locale = "fr-FR",
): string {
	if (typeof min !== "number") return formatXaf(max, locale);
	if (typeof max !== "number" || max === min) return formatXaf(min, locale);
	return `${Math.round(min).toLocaleString(locale)} – ${formatXaf(max, locale)}`;
}
