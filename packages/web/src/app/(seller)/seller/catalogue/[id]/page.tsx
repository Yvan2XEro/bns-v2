import { redirect } from "next/navigation";
import { ProductEditorLoader } from "~/components/seller/product-editor-loader";
import { getAllCategories, getMyShop } from "~/lib/server-shop";

export default async function EditProductPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const [{ id }, mine, categories] = await Promise.all([
		params,
		getMyShop(),
		getAllCategories(),
	]);
	if (!mine?.shop) redirect("/shop/new");

	return (
		<ProductEditorLoader
			productId={id}
			shopId={mine.shop.id}
			categories={categories}
		/>
	);
}
