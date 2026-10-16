import { cookies } from "next/headers";
import { cache } from "react";
import { ACTIVE_SHOP_COOKIE, myShopPath } from "~/lib/active-shop";
import type { VerificationBadge } from "~/lib/verification";
import type { Category, MyShopResponse, PublicShop } from "~/types";
import type { MarketConfig } from "../../../api/src/contracts/marketConfig";
import { DEFAULT_PHONE_COUNTRY } from "./phone-input";
import { serverGet } from "./server-api";

/** The shop the seller space works on: the switcher's cookie when the caller still belongs to it. */
export const getMyShop = cache(async (): Promise<MyShopResponse | null> => {
	const cookieStore = await cookies();
	return serverGet<MyShopResponse>(
		myShopPath(cookieStore.get(ACTIVE_SHOP_COOKIE)?.value ?? null),
	);
});

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
 * A listing's seller card needs the shop's badge, not just the raw `level`
 * on the depth-populated relation `GET /api/listings/:id` returns — same
 * reasoning as `getUserShop` above: re-fetch through the public shop route
 * so the badge is the server's computed, expiry-aware one, never
 * `badgeForLevel` over a raw `level`.
 */
export const getPublicShop = cache(
	async (handle: string): Promise<PublicShop | null> => {
		const result = await serverGet<{ shop: PublicShop }>(
			`/api/public/shops/${encodeURIComponent(handle)}`,
		);
		return result?.shop ?? null;
	},
);

export type ShopLookup = { shop: PublicShop } | { redirectTo: string } | null;

/**
 * The /s/[handle] read, shared by the shop layout (header, theme) and its
 * page: one request per render. A renamed handle answers `redirectTo`.
 */
export const lookupShop = cache(
	async (handle: string): Promise<ShopLookup> =>
		serverGet<ShopLookup>(
			`/api/public/shops/${encodeURIComponent(handle.toLowerCase())}`,
		),
);

export const getShopBadge = cache(
	async (handle: string): Promise<VerificationBadge | null> =>
		(await getPublicShop(handle))?.badge ?? null,
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

/** The launch market's served block; undefined when the config is unreachable or pre-migration. */
export const getMarket = cache(async (): Promise<MarketConfig | undefined> => {
	const config = await serverGet<{ market?: MarketConfig }>(
		`/api/public/config?country=${DEFAULT_PHONE_COUNTRY}`,
	);
	return config?.market;
});
