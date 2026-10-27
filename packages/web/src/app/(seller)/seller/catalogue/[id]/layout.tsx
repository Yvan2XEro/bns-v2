import { redirect } from "next/navigation";
import { ProductEditorLoader } from "~/components/seller/product-editor-loader";
import { getAllCategories, getMyShop } from "~/lib/server-shop";

/**
 * The product editor, for every tab of the product (`…/variants`,
 * `…/stock`). It lives in the layout, which stays mounted from one tab to
 * the next, so the form keeps what the seller typed; the tab pages render
 * nothing of their own.
 */
export default async function EditProductLayout({
	params,
	children,
}: {
	params: Promise<{ id: string }>;
	children: React.ReactNode;
}) {
	const [{ id }, mine, categories] = await Promise.all([
		params,
		getMyShop(),
		getAllCategories(),
	]);
	if (!mine?.shop) redirect("/shop/new");

	return (
		<>
			<ProductEditorLoader
				productId={id}
				shopId={mine.shop.id}
				categories={categories}
			/>
			{children}
		</>
	);
}
