import { cache } from "react";
import type { Category, MyShopResponse } from "~/types";
import { serverGet } from "./server-api";

export const getMyShop = cache(
	async (): Promise<MyShopResponse | null> =>
		serverGet<MyShopResponse>("/api/shops/mine"),
);

/**
 * Gates shop creation only, and fails closed: a failed read is indistinguishable
 * from the flag being off, which is the safe answer in both cases.
 */
export const getShopsEnabled = cache(async (): Promise<boolean> => {
	const config = await serverGet<{ shopsEnabled?: boolean }>(
		"/api/public/config",
	);
	return config?.shopsEnabled === true;
});

/** Root categories, the ones a shop picks "what it sells" from. */
export const getTopCategories = cache(async (): Promise<Category[]> => {
	const data = await serverGet<{ categories?: Category[] }>(
		"/api/public/categories",
	);
	return (data?.categories ?? []).filter((category) => !category.parent);
});

/** Every category, for product forms. */
export const getAllCategories = cache(async (): Promise<Category[]> => {
	const data = await serverGet<{ categories?: Category[] }>(
		"/api/public/categories",
	);
	return data?.categories ?? [];
});
