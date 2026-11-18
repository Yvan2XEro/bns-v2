import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { isListTab } from "./order-list";
import { OrdersClient } from "./orders-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SellerOrders");
	return { title: t("title") };
}

export default async function SellerOrdersPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const [mine, params] = await Promise.all([getMyShop(), searchParams]);
	if (!mine?.shop) redirect("/shop/new");

	return (
		<OrdersClient
			shopId={mine.shop.id}
			role={mine.role}
			shopCity={mine.shop.location.city}
			initialTab={isListTab(params.tab) ? params.tab : "all"}
		/>
	);
}
