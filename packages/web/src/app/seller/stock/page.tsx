import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { canSeeCost } from "~/lib/shop-roles";
import { StockClient } from "./stock-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Stock");
	return { title: t("title") };
}

export default async function StockPage({
	searchParams,
}: {
	searchParams: Promise<{ adjust?: string }>;
}) {
	const [mine, params] = await Promise.all([getMyShop(), searchParams]);
	if (!mine?.shop) redirect("/shop/new");
	const canSeeCosts = canSeeCost(mine.role);

	return (
		<StockClient
			shopId={mine.shop.id}
			canSeeCosts={canSeeCosts}
			adjustVariantId={params.adjust ?? null}
		/>
	);
}
