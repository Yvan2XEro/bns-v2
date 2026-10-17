import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { slipIds } from "~/lib/delivery-slip";
import { getMyShop } from "~/lib/server-shop";
import { SlipsClient } from "./slips-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SellerOrderList");
	return { title: t("slipsTitle") };
}

export default async function DeliverySlipsPage({
	searchParams,
}: {
	searchParams: Promise<{ ids?: string }>;
}) {
	const [mine, params] = await Promise.all([getMyShop(), searchParams]);
	if (!mine?.shop) redirect("/shop/new");
	return (
		<SlipsClient shopId={mine.shop.id} orderIds={slipIds(params.ids ?? null)} />
	);
}
