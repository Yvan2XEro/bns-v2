import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
	getMyShop,
	getShopsEnabled,
	getTopCategories,
} from "~/lib/server-shop";
import { CreateShopForm } from "./create-shop-form";

export default async function NewShopPage() {
	const [enabled, mine, categories, t] = await Promise.all([
		getShopsEnabled(),
		getMyShop(),
		getTopCategories(),
		getTranslations("ShopCreate"),
	]);

	if (!enabled) notFound();
	if (mine?.shop && mine.shop.status !== "closed") redirect("/seller");

	return (
		<div className="container mx-auto max-w-xl px-4 py-8">
			<h1 className="font-bold text-2xl text-ink">{t("title")}</h1>
			<p className="mt-1 mb-6 text-ink-muted text-sm">{t("subtitle")}</p>
			<CreateShopForm categories={categories} />
		</div>
	);
}
