"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "~/hooks/use-auth";
import { shopApi } from "~/lib/shop-api";
import type { MyShopResponse } from "~/types";

export const myShopKey = ["shops", "mine"] as const;

/**
 * The signed-in user's shop, role and dashboard counts.
 *
 * Not gated on `shopsEnabled`: that flag gates shop *creation*, and an existing
 * shop keeps working while it is off. Screens that offer to open a shop read
 * the flag from `useAppConfig()` themselves.
 */
export function useMyShop() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const enabled = Boolean(user?.id);

	const query = useQuery<MyShopResponse>({
		queryKey: myShopKey,
		queryFn: () => shopApi.mine(),
		enabled,
		retry: false,
	});

	const reload = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: myShopKey });
	}, [queryClient]);

	return {
		data: enabled ? (query.data ?? null) : null,
		loading: enabled && query.isPending,
		reload,
	};
}
