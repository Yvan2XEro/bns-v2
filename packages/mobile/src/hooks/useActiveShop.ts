import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { ACTIVE_SHOP_STORAGE_KEY, resolveActiveShop } from "../lib/activeShop";
import type { MyShopsEntry } from "../types/api";
import { useMyShops } from "./useMyShops";

/**
 * The shop every seller screen under `app/seller/**` reads for "which shop
 * am I in right now" — `useMyShops()` plus the AsyncStorage id, resolved the
 * same way on every screen rather than each one re-reading storage.
 */
export function useActiveShop(): {
	shop: MyShopsEntry | null;
	shops: MyShopsEntry[];
	setActiveShop: (shopId: string) => void;
	isLoading: boolean;
} {
	const myShops = useMyShops();
	const shops = myShops.data ?? [];
	const [storedId, setStoredId] = useState<string | null>(null);
	const [hydrated, setHydrated] = useState(false);

	// A one-time read of a value that lives outside React (AsyncStorage) to
	// seed local state — a subscription to the platform, not a data loader.
	useEffect(() => {
		let cancelled = false;
		AsyncStorage.getItem(ACTIVE_SHOP_STORAGE_KEY).then((value) => {
			if (cancelled) return;
			setStoredId(value);
			setHydrated(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const shop = hydrated ? resolveActiveShop(shops, storedId) : null;

	// A stored id can point at a shop the caller no longer belongs to (left,
	// removed) — once resolved, persist whichever shop was actually picked so
	// a stale id does not keep winning the AsyncStorage race on next launch.
	useEffect(() => {
		if (!hydrated || !shop || shop.shopId === storedId) return;
		AsyncStorage.setItem(ACTIVE_SHOP_STORAGE_KEY, shop.shopId).catch(() => {
			// Best-effort: worst case the next launch re-resolves the same way.
		});
	}, [hydrated, shop, storedId]);

	const setActiveShop = useCallback((shopId: string) => {
		setStoredId(shopId);
		AsyncStorage.setItem(ACTIVE_SHOP_STORAGE_KEY, shopId).catch(() => {
			// Best-effort: the in-memory switch still takes effect this session.
		});
	}, []);

	return {
		shop,
		shops,
		setActiveShop,
		isLoading: myShops.isLoading || !hydrated,
	};
}
