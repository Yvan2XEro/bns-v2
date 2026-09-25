import { redirect } from "next/navigation";
import { getMyShop, getTopCategories } from "~/lib/server-shop";
import { isShopOwner } from "~/lib/shop-roles";
import { ShopSettingsClient } from "./shop-settings-client";

const TABS = ["profile", "address", "contacts", "listings", "close"] as const;
type Tab = (typeof TABS)[number];

/** Owner-only tabs: the address change and the close form both refuse a non-owner. */
const OWNER_ONLY_TABS: readonly Tab[] = ["address", "close"];

export default async function ShopManagePage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string; move?: string }>;
}) {
	const [mine, categories, params] = await Promise.all([
		getMyShop(),
		getTopCategories(),
		searchParams,
	]);
	if (!mine?.shop) redirect("/shop/new");
	const owner = isShopOwner(mine.role);
	const openMove = params.move === "1";
	const requested: Tab = openMove
		? "listings"
		: (TABS as readonly string[]).includes(params.tab ?? "")
			? (params.tab as Tab)
			: "profile";
	// A manager linking straight to an owner-only tab (e.g. a stale bookmark)
	// lands on the profile tab instead of a tab it cannot see or use.
	const tab: Tab =
		!owner && OWNER_ONLY_TABS.includes(requested) ? "profile" : requested;

	return (
		<ShopSettingsClient
			shop={mine.shop}
			role={mine.role}
			personalListings={mine.counts?.personalListings ?? 0}
			categories={categories}
			initialTab={tab}
			openMove={openMove}
		/>
	);
}
