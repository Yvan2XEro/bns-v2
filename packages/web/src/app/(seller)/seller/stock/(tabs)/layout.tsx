import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { canSeeCost } from "~/lib/shop-roles";
import { StockHeader } from "./stock-header";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Stock");
	return { title: t("title") };
}

/**
 * The stock's two tabs — the real stock (/seller/stock) and the movements
 * (/seller/stock/movements) — under one header. The stock count
 * (/seller/stock/inventory) is a task of its own, outside this group.
 */
export default async function StockTabsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");

	return (
		<div className="space-y-5">
			<StockHeader shopId={mine.shop.id} canSeeCosts={canSeeCost(mine.role)} />
			{children}
		</div>
	);
}
