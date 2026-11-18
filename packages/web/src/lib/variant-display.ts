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
// first, including phone makers' marketing names. Anything else falls back to
// a text chip.
const SWATCHES: Record<string, string> = {
	noir: "#0f172a",
	black: "#0f172a",
	"noir de jais": "#0f172a",
	"jet black": "#0f172a",
	minuit: "#1e293b",
	midnight: "#1e293b",
	nuit: "#1e293b",
	onyx: "#111827",
	obsidian: "#111827",
	obsidienne: "#111827",
	carbone: "#1f2937",
	carbon: "#1f2937",
	phantom: "#111827",
	blanc: "#ffffff",
	white: "#ffffff",
	"lumiere stellaire": "#f3ede2",
	starlight: "#f3ede2",
	neige: "#fafafa",
	snow: "#fafafa",
	perle: "#f5f3ef",
	pearl: "#f5f3ef",
	nacre: "#f5f3ef",
	gris: "#94a3b8",
	grey: "#94a3b8",
	gray: "#94a3b8",
	"gris sideral": "#4b5563",
	"space grey": "#4b5563",
	"space gray": "#4b5563",
	sideral: "#4b5563",
	graphite: "#475569",
	anthracite: "#334155",
	ardoise: "#475569",
	slate: "#475569",
	acier: "#9ca3af",
	steel: "#9ca3af",
	titane: "#a8a29e",
	titanium: "#a8a29e",
	"titane naturel": "#bab5ab",
	"natural titanium": "#bab5ab",
	"titane noir": "#3f3f46",
	"black titanium": "#3f3f46",
	"titane blanc": "#e7e5e4",
	"white titanium": "#e7e5e4",
	"titane bleu": "#3b4a5e",
	"blue titanium": "#3b4a5e",
	"titane desert": "#c4a484",
	"desert titanium": "#c4a484",
	argent: "#e2e8f0",
	argente: "#e2e8f0",
	silver: "#e2e8f0",
	platine: "#e5e4e2",
	platinum: "#e5e4e2",
	chrome: "#d1d5db",
	or: "#fde68a",
	dore: "#fde68a",
	gold: "#fde68a",
	champagne: "#f1e2c3",
	"or rose": "#e8b4a6",
	"rose gold": "#e8b4a6",
	bronze: "#a16207",
	cuivre: "#b45309",
	copper: "#b45309",
	rouge: "#dc2626",
	red: "#dc2626",
	"product red": "#dc2626",
	"(product)red": "#dc2626",
	corail: "#fb7185",
	coral: "#fb7185",
	bordeaux: "#7f1d1d",
	burgundy: "#7f1d1d",
	grenat: "#7f1d1d",
	cerise: "#be123c",
	cherry: "#be123c",
	framboise: "#be185d",
	fuchsia: "#c026d3",
	magenta: "#c026d3",
	bleu: "#2563eb",
	blue: "#2563eb",
	"sierra blue": "#9bb5ce",
	"bleu sierra": "#9bb5ce",
	sierra: "#9bb5ce",
	"pacific blue": "#2f4f6f",
	"bleu pacifique": "#2f4f6f",
	pacifique: "#2f4f6f",
	"bleu alpin": "#5f7f9a",
	"alpine blue": "#5f7f9a",
	"bleu ciel": "#7dd3fc",
	"sky blue": "#7dd3fc",
	ciel: "#7dd3fc",
	sky: "#7dd3fc",
	azur: "#0ea5e9",
	azure: "#0ea5e9",
	cyan: "#06b6d4",
	indigo: "#4338ca",
	cobalt: "#1d4ed8",
	marine: "#1e3a8a",
	navy: "#1e3a8a",
	"bleu marine": "#1e3a8a",
	"bleu roi": "#1d4ed8",
	"royal blue": "#1d4ed8",
	jean: "#3b5b8c",
	denim: "#3b5b8c",
	turquoise: "#14b8a6",
	"bleu canard": "#0f766e",
	teal: "#0f766e",
	sarcelle: "#0f766e",
	vert: "#16a34a",
	green: "#16a34a",
	"vert nuit": "#1f3d33",
	"midnight green": "#1f3d33",
	"vert alpin": "#4b5e4a",
	"alpine green": "#4b5e4a",
	sapin: "#14532d",
	emeraude: "#059669",
	emerald: "#059669",
	menthe: "#6ee7b7",
	mint: "#6ee7b7",
	olive: "#65a30d",
	sauge: "#9caf88",
	sage: "#9caf88",
	pistache: "#a3e635",
	lime: "#84cc16",
	"vert lime": "#84cc16",
	kaki: "#78716c",
	khaki: "#78716c",
	jaune: "#facc15",
	yellow: "#facc15",
	moutarde: "#ca8a04",
	mustard: "#ca8a04",
	citron: "#fde047",
	lemon: "#fde047",
	orange: "#f97316",
	abricot: "#fdba74",
	apricot: "#fdba74",
	peche: "#fdba74",
	peach: "#fdba74",
	saumon: "#fa8072",
	salmon: "#fa8072",
	rose: "#f472b6",
	pink: "#f472b6",
	"rose pale": "#fbcfe8",
	"pale pink": "#fbcfe8",
	poudre: "#f9d5d3",
	blush: "#f9d5d3",
	violet: "#7c3aed",
	purple: "#7c3aed",
	"violet intense": "#4c1d95",
	"deep purple": "#4c1d95",
	lavande: "#c4b5fd",
	lavender: "#c4b5fd",
	lilas: "#c8a2c8",
	lilac: "#c8a2c8",
	prune: "#6b21a8",
	plum: "#6b21a8",
	aubergine: "#4a044e",
	mauve: "#c084fc",
	marron: "#78350f",
	brun: "#78350f",
	brown: "#78350f",
	chocolat: "#78350f",
	chocolate: "#78350f",
	cafe: "#6f4e37",
	coffee: "#6f4e37",
	caramel: "#b45309",
	camel: "#c19a6b",
	cognac: "#9a4f1a",
	taupe: "#8b7d6b",
	sable: "#d6c3a0",
	sand: "#d6c3a0",
	desert: "#c4a484",
	beige: "#e7d7b9",
	nude: "#e3c4a8",
	creme: "#fef3c7",
	cream: "#fef3c7",
	ecru: "#f3ead3",
	ivoire: "#fffbeb",
	ivory: "#fffbeb",
};

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A CSS colour for a colour option's value, or null to show the text alone. */
export function colourSwatch(value: string): string | null {
	const trimmed = value.trim();
	if (HEX.test(trimmed)) return trimmed;
	const key = trimmed
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/\s+/g, " ");
	if (SWATCHES[key]) return SWATCHES[key];
	// "Bleu nuit", "Titane noir naturel": a known pair of words wins over a
	// single word, then the first known word decides.
	const words = key.split(/[\s/-]+/).filter(Boolean);
	for (let i = 0; i + 1 < words.length; i++) {
		const pair = SWATCHES[`${words[i]} ${words[i + 1]}`];
		if (pair) return pair;
	}
	for (const word of words) {
		if (SWATCHES[word]) return SWATCHES[word];
	}
	return null;
}

/** Swatches this light need an outline to read on a white chip. */
export function isPaleSwatch(colour: string): boolean {
	const hex = colour.replace("#", "");
	const full =
		hex.length <= 4
			? hex
					.slice(0, 3)
					.split("")
					.map((c) => c + c)
					.join("")
			: hex.slice(0, 6);
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
