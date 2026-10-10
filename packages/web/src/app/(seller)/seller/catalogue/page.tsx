import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type CatalogueFilter, isCatalogueFilter } from "~/lib/catalogue";
import { getMyShop } from "~/lib/server-shop";
import { CatalogueClient } from "./catalogue-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Catalogue");
	return { title: t("title") };
}

export default async function CataloguePage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string; stock?: string }>;
}) {
	const [mine, params] = await Promise.all([getMyShop(), searchParams]);
	if (!mine?.shop) redirect("/shop/new");

	const requested = params.stock ?? params.status ?? "all";
	const initialFilter: CatalogueFilter = isCatalogueFilter(requested)
		? requested
		: "all";

	return (
		<CatalogueClient shopId={mine.shop.id} initialFilter={initialFilter} />
	);
}
