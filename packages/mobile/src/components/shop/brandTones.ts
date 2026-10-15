import {
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
