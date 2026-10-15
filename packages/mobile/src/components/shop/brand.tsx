import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
	type ShopTheme,
	shopTheme,
} from "../../../../api/src/contracts/shopTheme";
import { brandTones, type ShopBrand } from "./brandTones";

export type { ShopBrand } from "./brandTones";

/** Public shop surfaces only: buying, badges and warnings never read this. */
const ShopBrandContext = createContext<ShopTheme | null>(null);

export function ShopBrandProvider({
	brandColor,
	children,
}: {
	brandColor: string | null | undefined;
	children: ReactNode;
}) {
	const theme = useMemo(() => shopTheme(brandColor), [brandColor]);
	return (
		<ShopBrandContext.Provider value={theme}>
			{children}
		</ShopBrandContext.Provider>
	);
}

/** The shop's tones inside a `ShopBrandProvider`, the platform's outside one. */
export function useShopBrand(): ShopBrand {
	const theme = useContext(ShopBrandContext);
	const scheme = useColorScheme() === "dark" ? "dark" : "light";
	return useMemo(
		() => brandTones(theme ?? shopTheme(null), scheme),
		[theme, scheme],
	);
}

/** Tones for one shop outside any provider, e.g. a seller card on a listing. */
export function useBrandFor(brandColor: string | null | undefined): ShopBrand {
	const scheme = useColorScheme() === "dark" ? "dark" : "light";
	return useMemo(
		() => brandTones(shopTheme(brandColor), scheme),
		[brandColor, scheme],
	);
}
