import {
	isVariantInStock,
	matchVariant,
	resolveSelection,
	type SelectableVariant,
} from "./variants";

const COLOUR_OPTION = /^(couleurs?|coloris|teintes?|colou?rs?|shades?)$/i;

export function isColourOption(name: string): boolean {
	return COLOUR_OPTION.test(name.trim());
}

// Sellers type free text; these are the names they actually use, French
// first. Anything else falls back to a text chip.
const SWATCHES: Record<string, string> = {
	noir: "#0f172a",
	black: "#0f172a",
	blanc: "#ffffff",
	white: "#ffffff",
	gris: "#94a3b8",
	grey: "#94a3b8",
	gray: "#94a3b8",
	graphite: "#475569",
	anthracite: "#334155",
	argent: "#e2e8f0",
	argente: "#e2e8f0",
	silver: "#e2e8f0",
	or: "#fde68a",
	dore: "#fde68a",
	gold: "#fde68a",
	rouge: "#dc2626",
	red: "#dc2626",
	bordeaux: "#7f1d1d",
	burgundy: "#7f1d1d",
	bleu: "#2563eb",
	blue: "#2563eb",
	marine: "#1e3a8a",
	navy: "#1e3a8a",
	turquoise: "#14b8a6",
	vert: "#16a34a",
	green: "#16a34a",
	kaki: "#78716c",
	khaki: "#78716c",
	jaune: "#facc15",
	yellow: "#facc15",
	orange: "#f97316",
	rose: "#f472b6",
	pink: "#f472b6",
	violet: "#7c3aed",
	purple: "#7c3aed",
	mauve: "#c084fc",
	marron: "#78350f",
	brun: "#78350f",
	brown: "#78350f",
	chocolat: "#78350f",
	beige: "#e7d7b9",
	creme: "#fef3c7",
	cream: "#fef3c7",
	ivoire: "#fffbeb",
	ivory: "#fffbeb",
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A CSS colour for a colour option's value, or null to show the text alone. */
export function colourSwatch(value: string): string | null {
	const trimmed = value.trim();
	if (HEX.test(trimmed)) return trimmed;
	const key = trimmed.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
	if (SWATCHES[key]) return SWATCHES[key];
	// "Bleu nuit", "Space Grey": the first known word decides.
	for (const word of key.split(/[\s/-]+/)) {
		if (SWATCHES[word]) return SWATCHES[word];
	}
	return null;
}

/** Swatches this light need an outline to read on a white chip. */
export function isPaleSwatch(colour: string): boolean {
	const hex = colour.replace("#", "");
	const full =
		hex.length === 3
			? hex
					.split("")
					.map((c) => c + c)
					.join("")
			: hex;
	const [r, g, b] = [0, 2, 4].map((i) =>
		Number.parseInt(full.slice(i, i + 2), 16),
	);
	return 0.299 * r + 0.587 * g + 0.114 * b > 215;
}

export type StockStatus =
	| { kind: "soldOut" }
	| { kind: "inStock"; count: number | null };

/** The buyer's stock line: an exact count only when the API chose to send one. */
export function stockStatus(variant: {
	available: boolean;
	trackInventory: boolean;
	availableCount?: number | null;
}): StockStatus {
	if (!isVariantInStock(variant)) return { kind: "soldOut" };
	const count =
		variant.trackInventory && typeof variant.availableCount === "number"
			? variant.availableCount
			: null;
	return { kind: "inStock", count };
}

/**
 * The price a value would move the buyer to, when it differs from what is
 * selected now; null when picking it changes nothing about the price.
 */
export function optionValuePrice<
	T extends SelectableVariant & { price: number },
>(
	variants: T[],
	selected: Record<string, string>,
	optionName: string,
	value: string,
): number | null {
	const current = matchVariant(variants, selected);
	if (!current || selected[optionName] === value) return null;
	const target = matchVariant(
		variants,
		resolveSelection(variants, selected, optionName, value),
	);
	if (!target || target.price === current.price) return null;
	return target.price;
}
