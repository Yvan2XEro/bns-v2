import { cache } from "react";
import type { Category, MyShopResponse, PublicShop } from "~/types";
import { serverGet } from "./server-api";

export const getMyShop = cache(
	async (): Promise<MyShopResponse | null> =>
		serverGet<MyShopResponse>("/api/shops/mine"),
);

/**
 * A profile page needs a stranger's shop badge, not just their personal
 * stats — there is no by-owner endpoint, so this looks the shop up by owner
 * (the same anonymous-readable `status: active` filter every other public
 * shop read uses) and then re-fetches it through the public shop route so
 * the badge is the server's computed one, never `badgeForLevel` over a raw
 * `level`. Mirrors `useUserShop` in `packages/mobile/src/hooks/useShops.ts`.
 */
export const getUserShop = cache(
	async (userId: string): Promise<PublicShop | null> => {
		const page = await serverGet<{ docs: { handle: string }[] }>(
			`/api/shops?where[owner][equals]=${encodeURIComponent(userId)}&where[status][equals]=active&limit=1&depth=0`,
		);
		const handle = page?.docs[0]?.handle;
		if (!handle) return null;
		const result = await serverGet<{ shop: PublicShop }>(
			`/api/public/shops/${encodeURIComponent(handle)}`,
		);
		return result?.shop ?? null;
	},
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
