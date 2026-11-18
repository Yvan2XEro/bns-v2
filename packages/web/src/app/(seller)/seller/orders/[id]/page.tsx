import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { OrderClient } from "./order-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SellerOrders");
	return { title: t("title") };
}

export default async function SellerOrderPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const [mine, { id }] = await Promise.all([getMyShop(), params]);
	if (!mine?.shop) redirect("/shop/new");

	return <OrderClient shopId={mine.shop.id} orderId={id} />;
}
