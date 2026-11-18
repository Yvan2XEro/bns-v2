import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useMyShops } from "@/src/hooks/useMyShops";
import {
	ACTIVE_SHOP_STORAGE_KEY,
	resolveActiveShop,
} from "@/src/lib/activeShop";
import {
	isBrandColor,
	type ShopTheme,
	shopTheme,
} from "../../../../api/src/contracts/shopTheme";

/** The active shop's theme when it picked a colour; null keeps the platform's. */
const SellerBrandContext = createContext<ShopTheme | null>(null);

/** True inside the seller tabs, whose screens are not `seller/…` routes. */
export const SellerAreaContext = createContext(false);

/**
 * Mounted once at the root. The stored active shop is re-read on every
 * navigation, so a switch made on a seller screen recolours the next one.
 */
export function SellerBrandProvider({ children }: { children: ReactNode }) {
	const shops = useMyShops().data;
	const pathname = usePathname();
	const [storedId, setStoredId] = useState<string | null>(null);

	useEffect(() => {
		if (!pathname) return;
		let cancelled = false;
		AsyncStorage.getItem(ACTIVE_SHOP_STORAGE_KEY)
			.then((value) => {
				if (!cancelled) setStoredId(value);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [pathname]);

	const brandColor = shops
		? resolveActiveShop(shops, storedId)?.brandColor
		: null;
	const theme = useMemo(
		() => (isBrandColor(brandColor) ? shopTheme(brandColor) : null),
		[brandColor],
	);
	return (
		<SellerBrandContext.Provider value={theme}>
			{children}
		</SellerBrandContext.Provider>
	);
}

/** The active shop's theme wherever the caller is, for the seller tab bar itself. */
export function useActiveShopBrandTheme(): ShopTheme | null {
	return useContext(SellerBrandContext);
}

const SELLER_ROUTE = /^\/(seller|shop)\//;

/** The active shop's theme on a seller screen, null anywhere else. */
export function useSellerBrandTheme(): ShopTheme | null {
	const theme = useContext(SellerBrandContext);
	const inSellerTabs = useContext(SellerAreaContext);
	const pathname = usePathname();
	if (!theme) return null;
	return inSellerTabs || SELLER_ROUTE.test(pathname ?? "") ? theme : null;
}
