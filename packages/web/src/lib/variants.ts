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

/**
 * The shape the combination helpers below need. Both `VariantDoc` (shop
 * member/staff, raw collection) and `PublicVariantDoc` (buyer, public
 * endpoint) satisfy it: the API's `beforeRead` hook derives `available` for
 * every reader before field access strips the raw counters, so it is never
 * missing on either payload.
 */
export interface SelectableVariant {
	optionValues: Record<string, string> | null;
	available: boolean;
}

/**
 * One predicate, honest for both a shop member's payload (which also carries
 * `stockOnHand`/`stockReserved`, unused here) and a buyer's (which does not):
 * both always carry the server-derived `available` boolean, so there is
 * nothing to compute client-side and no risk of a buyer payload's absent
 * counters being silently read as zero stock.
 */
export function isVariantInStock(
	variant: Pick<SelectableVariant, "available">,
): boolean {
	return variant.available;
}

/** The variant whose option values match exactly, or null. */
export function matchVariant<T extends SelectableVariant>(
	variants: T[],
	values: Record<string, string>,
): T | null {
	return (
		variants.find((variant) =>
			Object.entries(variant.optionValues ?? {}).every(
				([name, value]) => values[name] === value,
			),
		) ?? null
	);
}

/**
 * True when no in-stock variant carries this value for this option, no
 * matter what is currently selected for the other options. Drives whether a
 * buyer-facing chip is genuinely unselectable, as opposed to merely pointing
 * at a combination that happens to be out of stock right now.
 */
export function isOptionValueUnavailable<T extends SelectableVariant>(
	variants: T[],
	optionName: string,
	value: string,
): boolean {
	return !variants.some(
		(variant) =>
			variant.optionValues?.[optionName] === value && isVariantInStock(variant),
	);
}

/**
 * The selection to move to once the buyer picks `value` for `optionName`.
 * The exact combination is kept when it exists and is in stock (no change of
 * plan needed) or when it does not exist in stock anywhere at all (nothing
 * better to offer — the summary reports it as unavailable). Otherwise — the
 * exact combination exists but is sold out, or never existed — it resolves to
 * an in-stock variant that does carry `value`, picked to keep as many of the
 * other currently selected values as possible. This is what lets a buyer on
 * Blue/M reach Red/L by clicking Red, instead of landing on a sold-out Red/M.
 */
export function resolveSelection<T extends SelectableVariant>(
	variants: T[],
	current: Record<string, string>,
	optionName: string,
	value: string,
): Record<string, string> {
	const desired = { ...current, [optionName]: value };
	const exact = matchVariant(variants, desired);
	if (exact && isVariantInStock(exact)) return desired;

	const candidates = variants.filter(
		(variant) =>
			variant.optionValues?.[optionName] === value && isVariantInStock(variant),
	);
	if (candidates.length === 0) return desired;

	let best = candidates[0];
	let bestScore = -1;
	for (const candidate of candidates) {
		let score = 0;
		for (const [name, val] of Object.entries(current)) {
			if (name === optionName) continue;
			if (candidate.optionValues?.[name] === val) score++;
		}
		if (score > bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	return best.optionValues ?? desired;
}
