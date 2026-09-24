export interface OptionDef {
	name: string;
	values: string[];
}

export interface VariantLike {
	price?: number | null;
	stockOnHand?: number | null;
	stockReserved?: number | null;
	trackInventory?: boolean | null;
	lowStockThreshold?: number | null;
	archivedAt?: string | Date | null;
}

export function generateCombinations(
	options: OptionDef[],
): Record<string, string>[] {
	return options.reduce<Record<string, string>[]>(
		(combos, option) =>
			combos.flatMap((combo) =>
				option.values.map((value) => ({ ...combo, [option.name]: value })),
			),
		[{}],
	);
}

/** Option order, not property order, so two equal combinations share one key. */
export function combinationKey(
	optionValues: Record<string, string>,
	options: OptionDef[],
): string {
	return options
		.map((option) => `${option.name}=${optionValues[option.name] ?? ""}`)
		.join("|");
}

export function variantLabel(optionValues: unknown): string {
	if (!optionValues || typeof optionValues !== "object") return "";
	return Object.values(optionValues as Record<string, unknown>)
		.filter(
			(value): value is string => typeof value === "string" && value.length > 0,
		)
		.join(" · ");
}

export function availableOf(variant: VariantLike): number {
	return Math.max(
		0,
		Number(variant.stockOnHand ?? 0) - Number(variant.stockReserved ?? 0),
	);
}

export function isOutOfStock(variant: VariantLike): boolean {
	return variant.trackInventory === true && availableOf(variant) <= 0;
}

export function isLowStock(variant: VariantLike): boolean {
	if (variant.trackInventory !== true) return false;
	if (typeof variant.lowStockThreshold !== "number") return false;
	const available = availableOf(variant);
	return available > 0 && available <= variant.lowStockThreshold;
}

/** True once per downward crossing, so the alert does not repeat on every sale below the line. */
export function crossedLowStock(
	before: number,
	after: number,
	threshold: number | null,
): boolean {
	if (threshold === null || threshold === undefined) return false;
	return before > threshold && after <= threshold;
}

export function summarizeVariants(variants: VariantLike[]) {
	const live = variants.filter((variant) => !variant.archivedAt);
	const prices = live
		.map((variant) => Number(variant.price))
		.filter((price) => Number.isFinite(price));
	const tracked = live.filter((variant) => variant.trackInventory === true);
	return {
		priceMin: prices.length ? Math.min(...prices) : null,
		priceMax: prices.length ? Math.max(...prices) : null,
		available: tracked.length
			? tracked.reduce((sum, variant) => sum + availableOf(variant), 0)
			: null,
		stockOnHand: tracked.reduce(
			(sum, variant) => sum + Number(variant.stockOnHand ?? 0),
			0,
		),
		variantCount: live.length,
		trackInventory: tracked.length > 0,
	};
}

export function marginPercent(
	price: number,
	cost: number | null | undefined,
): number | null {
	if (cost === null || cost === undefined || !(price > 0)) return null;
	return Math.round(((price - cost) / price) * 1000) / 10;
}

/**
 * The purchase cost is a shop secret. It leaves the API only for a member who
 * can manage the shop, on reads and on the answer to a write alike.
 *
 * The field must be gone, not merely undefined: `JSON.stringify` keeps an
 * undefined-valued key off the wire too, but callers should never be able to
 * detect the key existed on the source document.
 */
export function redactCost<T extends { cost?: number | null }>(
	variants: T[],
	canSeeCost: boolean,
): T[] {
	if (canSeeCost) return variants;
	// biome-ignore lint/performance/noDelete: correctness over micro-perf on a small array
	for (const variant of variants) delete variant.cost;
	return variants;
}
