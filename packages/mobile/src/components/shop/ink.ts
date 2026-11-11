import type { ShopPalette } from "./theme";

/**
 * The fill behind a white label (filled buttons, selected chips, ticked
 * boxes). Reads `c.fill`: `#2f43b5` in dark mode for the platform colour, and
 * a shop's own colour darkened to 4.5:1 against white.
 *
 * Not for bars, dots or rails with nothing on top: those keep `c.primary`,
 * which stands out better against the dark card.
 */
export function fillOf(c: ShopPalette): string {
	return c.fill;
}

/**
 * Red for words (errors, destructive links). `c.danger` is a fill colour: on
 * the dark ground it falls to about 3:1, so dark mode reads the softer
 * `dangerText` instead. Light mode keeps the brand red (4.6:1 on white).
 */
export function dangerInk(c: ShopPalette): string {
	return c.isDark ? c.dangerText : c.danger;
}

/** Green for words, same reasoning as `dangerInk`. */
export function successInk(c: ShopPalette): string {
	return c.isDark ? c.successText : c.success;
}
