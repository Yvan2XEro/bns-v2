import type { ShopPalette } from "@/src/components/shop/theme";

/**
 * Background and label colour for a filled button. Reads the palette's
 * `fill`: in dark mode the platform primary is a light indigo that white text
 * fails on (3.8:1), so filled actions take the deeper `#2448ab`.
 */
export function fillOf(c: ShopPalette): { bg: string; fg: string } {
	return { bg: c.fill, fg: "#ffffff" };
}

/**
 * Colour for primary-coloured text that sits on a card or on the soft
 * selected fill: links, selected chip labels, inline actions. Reads the
 * palette's `link` (`#9ec5fe` on night cards, 7:1).
 */
export function inkOf(c: ShopPalette): string {
	return c.link;
}
