import { redirect } from "next/navigation";
import { getMyShop } from "~/lib/server-shop";
import { SellerReturnsClient } from "./seller-returns-client";

export default async function SellerReturnsPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/seller");
	return <SellerReturnsClient shopId={mine.shop.id} />;
}
