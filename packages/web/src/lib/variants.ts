import type { VariantDoc } from "~/types";

export interface OptionSpec {
	name: string;
	values: string[];
}

/** Every combination of option values, in option order. No options → one default variant. */
export function generateCombinations(
	options: OptionSpec[],
): Record<string, string>[] {
	const usable = options.filter(
		(option) => option.name.trim() && option.values.length > 0,
	);
	let combos: Record<string, string>[] = [{}];
	for (const option of usable) {
		const next: Record<string, string>[] = [];
		for (const combo of combos) {
			for (const value of option.values) {
				next.push({ ...combo, [option.name.trim()]: value });
			}
		}
		combos = next;
	}
	return combos;
}

/** Stable identity of a combination, independent of key order. */
export function optionValuesKey(values: Record<string, string>): string {
	return JSON.stringify(
		Object.entries(values).sort(([a], [b]) => a.localeCompare(b)),
	);
}

export function variantLabel(
	values: Record<string, string> | null | undefined,
	fallback: string,
): string {
	const parts = Object.values(values ?? {}).filter(Boolean);
	return parts.length > 0 ? parts.join(" · ") : fallback;
}

/** Margin on the selling price, in percent with one decimal, or null when unknown. */
export function marginPercent(
	price: number | null | undefined,
	cost: number | null | undefined,
): number | null {
	if (typeof price !== "number" || typeof cost !== "number" || price <= 0) {
		return null;
	}
	return Math.round(((price - cost) / price) * 1000) / 10;
}

export function availableOf(
	variant: Pick<VariantDoc, "stockOnHand" | "stockReserved">,
): number {
	return (variant.stockOnHand ?? 0) - (variant.stockReserved ?? 0);
}
