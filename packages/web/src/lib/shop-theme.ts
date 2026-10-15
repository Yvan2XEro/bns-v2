import type { CSSProperties } from "react";
import {
	isBrandColor,
	PLATFORM_ACCENT,
	type ShopTheme,
	type ShopThemeTones,
	shopTheme,
} from "../../../api/src/contracts/shopTheme";

export { isBrandColor, PLATFORM_ACCENT, type ShopTheme, shopTheme };

/** Curated picks that read well as a header band and as an accent on white. */
export const BRAND_SWATCHES = [
	"#1E40AF",
	"#0E7490",
	"#0F766E",
	"#15803D",
	"#B45309",
	"#C2410C",
	"#B91C1C",
	"#BE185D",
	"#7C3AED",
	"#334155",
] as const;

const TOKENS: [keyof ShopThemeTones, string][] = [
	["accent", "accent"],
	["onAccent", "on-accent"],
	["accentText", "accent-text"],
	["accentSoft", "accent-soft"],
	["headerBg", "header-bg"],
	["headerFg", "header-fg"],
	["headerMuted", "header-muted"],
];

/**
 * The shop's colours as CSS variables for `[data-shop-theme]`. `--shop-*` are
 * the light tones: the shop pages draw on fixed white surfaces whatever the
 * system scheme. `--shop-dark-*` ride along, and a surface that does follow
 * the scheme opts into them with `data-shop-scheme="system"` (globals.css).
 */
export function shopThemeVars(theme: ShopTheme): CSSProperties {
	const vars: CSSProperties & Record<`--${string}`, string> = {};
	for (const [key, token] of TOKENS) {
		vars[`--shop-${token}`] = theme.light[key];
		vars[`--shop-dark-${token}`] = theme.dark[key];
	}
	return vars;
}

/** "#ABCDEF" from what a seller typed: "abcdef", " #abcdef ", or null when it is not a colour. */
export function normalizeBrandInput(input: string): string | null {
	const trimmed = input.trim();
	const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
	return isBrandColor(hex) ? hex.toUpperCase() : null;
}

/**
 * The most present saturated colour in an image's RGBA pixels, for "suggest
 * from my logo". Near-white, near-black and grey pixels are skipped: they are
 * the logo's background and outlines, not its brand. Null when nothing
 * colourful is left.
 */
export function dominantColor(pixels: Uint8ClampedArray): string | null {
	const buckets = new Map<
		number,
		{ n: number; r: number; g: number; b: number }
	>();
	for (let i = 0; i + 3 < pixels.length; i += 4) {
		const [r, g, b, a] = [
			pixels[i],
			pixels[i + 1],
			pixels[i + 2],
			pixels[i + 3],
		];
		if (a < 128) continue;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		if (max < 40 || min > 225 || max - min < 40) continue;
		const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
		const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
		bucket.n++;
		bucket.r += r;
		bucket.g += g;
		bucket.b += b;
		buckets.set(key, bucket);
	}
	let best: { n: number; r: number; g: number; b: number } | null = null;
	for (const bucket of buckets.values()) {
		if (!best || bucket.n > best.n) best = bucket;
	}
	if (!best) return null;
	const { n, r, g, b } = best;
	return `#${[r, g, b]
		.map((sum) =>
			Math.round(sum / n)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")
		.toUpperCase()}`;
}
