import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { type CatalogueFilter, isCatalogueFilter } from "~/lib/catalogue";
import {
	getAllCategories,
	getCategoryNamesIn,
	getMyShop,
} from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
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
	const [mine, params, categories, locale] = await Promise.all([
		getMyShop(),
		searchParams,
		getAllCategories(),
		getLocale(),
	]);
	const otherCategoryNames = await getCategoryNamesIn(
		locale === "en" ? "fr" : "en",
	);
	if (!mine?.shop) redirect("/shop/new");

	const requested = params.stock ?? params.status ?? "all";
	const initialFilter: CatalogueFilter = isCatalogueFilter(requested)
		? requested
		: "all";

	return (
		<CatalogueClient
			shopId={mine.shop.id}
			initialFilter={initialFilter}
			categories={categories}
			otherCategoryNames={otherCategoryNames}
			permissions={{
				resale: can(mine.role, "resale.manage"),
				archive: can(mine.role, "catalogue.archive"),
				costs: can(mine.role, "costs.view"),
			}}
		/>
	);
}
