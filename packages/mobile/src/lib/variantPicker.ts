import type { PublicVariantDoc } from "../types/api";
import type { ProductOption } from "./variants";

/**
 * The only purchasability signal a buyer payload carries: `available` is
 * derived server-side, before field access strips the raw stock counters a
 * buyer never receives (see `ProductVariants.beforeRead` on the API). This
 * must never be recomputed from `stockOnHand`/`stockReserved` — the public
 * endpoint's response does not even declare them.
 */
export function isVariantInStock(
	variant: Pick<PublicVariantDoc, "available">,
): boolean {
	return variant.available;
}

/** The variant whose option values match every entry of `selection` exactly. */
export function matchVariant(
	variants: PublicVariantDoc[],
	selection: Record<string, string>,
): PublicVariantDoc | null {
	return (
		variants.find((variant) =>
			Object.entries(variant.optionValues ?? {}).every(
				([name, value]) => selection[name] === value,
			),
		) ?? null
	);
}

/**
 * The buyer's starting point: the first variant in stock, falling back to
 * the first variant at all, falling back to one value per option when the
 * product has no variants yet.
 */
export function initialSelection(
	variants: PublicVariantDoc[],
	options: ProductOption[],
): Record<string, string> {
	const start = variants.find(isVariantInStock) ?? variants[0];
	if (start) return { ...(start.optionValues ?? {}) };
	return Object.fromEntries(
		options.map((option) => [option.name, option.values[0] ?? ""]),
	);
}

/**
 * True when NO in-stock variant carries this value for this option, no
 * matter what is currently selected for the other options. This — not
 * whether the value resolves against the current selection — is what makes a
 * chip genuinely unselectable, as opposed to merely pointing right now at a
 * combination that happens to be sold out. Getting this wrong stranded a
 * buyer on Blue/M who could never reach an in-stock Red/L because Red/M
 * (the exact match for their current Size) was sold out.
 */
export function isOptionValueUnavailable(
	variants: PublicVariantDoc[],
	optionName: string,
	value: string,
): boolean {
	return !variants.some(
		(variant) =>
			variant.optionValues?.[optionName] === value && isVariantInStock(variant),
	);
}

/**
 * The selection to move to once the buyer taps `value` for `optionName`.
 * Kept exact when it exists and is in stock (nothing to resolve), or when it
 * does not exist in stock anywhere at all (nothing better to offer — the UI
 * reports it as unavailable). Otherwise it resolves to an in-stock variant
 * that does carry `value`, chosen to keep as many of the other currently
 * selected values as possible: on a Colour x Size product where Red/M is
 * sold out but Red/L is in stock, a buyer on Blue/M who taps Red lands on
 * Red/L instead of a dead end.
 */
export function resolveSelection(
	variants: PublicVariantDoc[],
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
