import { redirect } from "next/navigation";
import { getMyShop } from "~/lib/server-shop";
import { StockLevels } from "./stock-levels";

/** /seller/stock: the shop's real stock, variant by variant. */
export default async function StockLevelsPage({
	searchParams,
}: {
	searchParams: Promise<{ adjust?: string }>;
}) {
	const [mine, params] = await Promise.all([getMyShop(), searchParams]);
	if (!mine?.shop) redirect("/shop/new");

	return (
		<StockLevels
			shopId={mine.shop.id}
			adjustVariantId={params.adjust ?? null}
		/>
	);
}
