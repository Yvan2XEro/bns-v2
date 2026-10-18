import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { isShopOwner } from "~/lib/shop-roles";
import { ShopAdsClient } from "./shop-ads-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SellerAds");
	return { title: t("title") };
}

export default async function ShopAdsPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");

	return (
		<ShopAdsClient
			shopId={mine.shop.id}
			profile={mine.shop.profile}
			// A shop ad's seller is the owner, and only the seller may edit,
			// close or renew it.
			canManage={isShopOwner(mine.role)}
		/>
	);
}
