import { useColorScheme } from "@/hooks/use-color-scheme";
import { sellerBrandPalette } from "./brandTones";
import { useSellerBrandTheme } from "./sellerBrand";

export interface ShopPalette {
	isDark: boolean;
	bg: string;
	header: string;
	card: string;
	input: string;
	text: string;
	body: string;
	muted: string;
	border: string;
	primary: string;
	primarySoft: string;
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
	return {
		isDark,
		bg: isDark ? "#0c1030" : "#f4f5f9",
		header: isDark ? "#12163a" : "#e9ecfa",
		card: isDark ? "#1a1f4a" : "#ffffff",
		input: isDark ? "#12163a" : "#f4f5f9",
		text: isDark ? "#e1e3ee" : "#12163a",
		body: isDark ? "#c9cce0" : "#3a3f66",
		muted: isDark ? "#a3a7c8" : "#5b6088",
		border: isDark ? "#2a3170" : "#e1e3ee",
		primary: isDark ? "#6878ea" : "#23338f",
		primarySoft: isDark ? "#1d2568" : "#e3e7f8",
		...branded,
		sell: "#ffb81c",
		success: "#1e8a4f",
		successSoft: isDark ? "#0b2a18" : "#ddf3e5",
		successText: isDark ? "#8fddb0" : "#155c35",
		warningSoft: isDark ? "#3a2a00" : "#fff1c7",
		warningText: isDark ? "#ffd25a" : "#6e4700",
		danger: "#d23a2e",
		dangerSoft: isDark ? "#3d0f0b" : "#fbe3e0",
		dangerText: isDark ? "#f2a79f" : "#8e2219",
		neutralSoft: isDark ? "#1a1f4a" : "#eceef5",
		neutralText: isDark ? "#c9cce0" : "#4a4f78",
	};
}
