import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductEditor } from "~/components/seller/product-editor";
import { getAllCategories, getMyShop } from "~/lib/server-shop";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("ProductEditor");
	return { title: t("newProduct") };
}

export default async function NewProductPage() {
	const [mine, categories] = await Promise.all([
		getMyShop(),
		getAllCategories(),
	]);
	if (!mine?.shop) redirect("/shop/new");

	return <ProductEditor shopId={mine.shop.id} categories={categories} />;
}
