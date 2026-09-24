import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { canSeeCost } from "~/lib/shop-roles";
import { InventoryClient } from "./inventory-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Inventory");
	return { title: t("title") };
}

export default async function InventoryPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");
	return (
		<InventoryClient shopId={mine.shop.id} showCost={canSeeCost(mine.role)} />
	);
}
