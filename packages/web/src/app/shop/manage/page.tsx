import { redirect } from "next/navigation";
import { getMyShop, getTopCategories } from "~/lib/server-shop";
import { ShopSettingsClient } from "./shop-settings-client";

const TABS = ["profile", "address", "contacts", "listings", "close"] as const;
type Tab = (typeof TABS)[number];

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
	const openMove = params.move === "1";
	const tab: Tab = openMove
		? "listings"
		: (TABS as readonly string[]).includes(params.tab ?? "")
			? (params.tab as Tab)
			: "profile";

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
