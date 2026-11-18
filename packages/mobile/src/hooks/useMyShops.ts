import { useQuery } from "@tanstack/react-query";
import { shopApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { shopKeys } from "./useShops";

/** Drives the shop switcher across every shop the caller belongs to, not just the one they own. */
export function useMyShops() {
	const { user } = useAuth();
	return useQuery({
		queryKey: shopKeys.myShops,
		queryFn: () => shopApi.listMyShops(),
		enabled: Boolean(user),
		staleTime: 30_000,
	});
}
