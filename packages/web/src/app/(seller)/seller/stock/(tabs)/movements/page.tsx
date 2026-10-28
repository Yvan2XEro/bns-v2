import { redirect } from "next/navigation";
import { getMyShop } from "~/lib/server-shop";
import { StockMovements } from "../stock-movements";

/** /seller/stock/movements: the shop's ledger. */
export default async function StockMovementsPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");

	return <StockMovements shopId={mine.shop.id} />;
}
