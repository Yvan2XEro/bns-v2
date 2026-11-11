import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { sellerBrandPalette } from "./brandTones";
import { useSellerBrandTheme } from "./sellerBrand";

export interface ShopPalette {
	isDark: boolean;
	bg: string;
	card: string;
	input: string;
	text: string;
	body: string;
	muted: string;
	border: string;
	primary: string;
	primarySoft: string;
	/**
	 * Behind a white label: filled buttons, selected chips, ticked boxes. The
	 * platform's night primary gives white only 3.8:1, so it steps down to
	 * `#2448ab`; a shop's own colour is already darkened by its brand palette.
	 * Bars, dots and rails with nothing on top keep `primary`.
	 */
	fill: string;
	/** Brand-coloured words on a card: links, selected labels, inline actions. */
	link: string;
	sell: string;
	success: string;
	successSoft: string;
	successText: string;
	warningSoft: string;
	warningText: string;
	danger: string;
	dangerSoft: string;
	dangerText: string;
	neutralSoft: string;
	neutralText: string;
}

/**
 * One palette for every shop and seller screen, matching DesignSystem.dc.html.
 * On a seller screen of a shop that picked a colour, `primary` and
 * `primarySoft` are that colour's.
 */
export function useShopTheme(): ShopPalette {
	const isDark = useColorScheme() === "dark";
	const brand = useSellerBrandTheme();
	const branded = brand
		? sellerBrandPalette(brand, isDark ? "dark" : "light")
		: null;
	const c = Colors[isDark ? "dark" : "light"];
	return {
		isDark,
		bg: c.background,
		card: c.card,
		input: isDark ? c.well : c.background,
		text: c.foreground,
		body: c.body,
		muted: c.mutedForeground,
		border: c.border,
		primary: c.primary,
		primarySoft: c.primaryTint,
		fill: c.primaryFill,
		link: c.link,
		...(branded ? { ...branded, link: branded.primary } : null),
		// Signage yellow and the fills keep their day value in both themes.
		sell: Colors.light.sun,
		success: Colors.light.success,
		successSoft: c.successTint,
		successText: c.successText,
		warningSoft: c.warningTint,
		warningText: c.warningText,
		danger: Colors.light.destructive,
		dangerSoft: c.dangerTint,
		dangerText: c.dangerText,
		neutralSoft: isDark ? c.card : c.well,
		/** Words on `neutralSoft`: running-text ink, 9:1 on the well by day. */
		neutralText: c.body,
	};
}
