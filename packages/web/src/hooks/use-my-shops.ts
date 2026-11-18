"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { myShopsKey } from "~/lib/query-keys";
import { shopApi } from "~/lib/shop-api";
import type { MyShopsEntry } from "~/types";

export { myShopsKey };

/** Every shop the signed-in user belongs to, for the shop switcher and inbox badges. */
export function useMyShops() {
	return useQuery<MyShopsEntry[], ApiError>({
		queryKey: myShopsKey(),
		queryFn: () => shopApi.listMyShops(),
		retry: false,
	});
}
