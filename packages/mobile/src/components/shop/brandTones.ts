import {
	contrast,
	isBrandColor,
	type ShopTheme,
	type ShopThemeTones,
} from "../../../../api/src/contracts/shopTheme";

export interface ShopBrand extends ShopThemeTones {
	/** `light` content (white status bar icons) when the header band is dark. */
	statusBarStyle: "light" | "dark";
}

export function brandTones(
	theme: ShopTheme,
	scheme: "light" | "dark",
): ShopBrand {
	const tones = scheme === "dark" ? theme.dark : theme.light;
	return {
		...tones,
		statusBarStyle:
			tones.headerFg.toUpperCase() === "#FFFFFF" ? "light" : "dark",
	};
}

export const BRAND_SWATCHES = [
	"#1E40AF",
	"#0E7490",
	"#0F766E",
	"#15803D",
	"#B45309",
	"#9A3412",
	"#B91C1C",
	"#BE185D",
	"#7C3AED",
	"#334155",
] as const;

/**
 * What the colour field holds, turned into what the API takes: empty is
 * "back to the platform colour", a missing `#` is forgiven, anything else
 * must pass the API's own rule.
 */
export function parseBrandColorInput(
	raw: string,
): { ok: true; value: string | null } | { ok: false } {
	const trimmed = raw.trim();
	if (trimmed === "") return { ok: true, value: null };
	const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
	return isBrandColor(withHash)
		? { ok: true, value: withHash.toUpperCase() }
		: { ok: false };
}

const WHITE = "#FFFFFF";
const INK = "#0F172A";

function mixHex(a: string, b: string, weightOfB: number): string {
	const rgb = (hex: string) => {
		const n = Number.parseInt(hex.slice(1), 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	};
	const x = rgb(a);
	const y = rgb(b);
	return `#${x
		.map((c, i) =>
			Math.round(c + (y[i] - c) * weightOfB)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")
		.toUpperCase()}`;
}

/**
 * The seller screens' `primary` in the shop's colour. It fills buttons under
 * white text and colours links on the page, so it is the shop's text tone
 * darkened until white reads on it (4.5:1 in light, 3:1 in dark, the platform
 * blue's own compromise there).
 */
export function sellerBrandPalette(
	theme: ShopTheme,
	scheme: "light" | "dark",
): { primary: string; primarySoft: string } {
	const tones = scheme === "dark" ? theme.dark : theme.light;
	const target = scheme === "dark" ? 3 : 4.5;
	let primary = tones.accentText;
	for (let step = 1; step <= 20 && contrast(primary, WHITE) < target; step++) {
		primary = mixHex(tones.accentText, INK, step / 20);
	}
	return { primary, primarySoft: tones.accentSoft };
}
