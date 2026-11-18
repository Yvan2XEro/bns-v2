import { redirect } from "next/navigation";
import { getMyShop } from "~/lib/server-shop";
import { SellerDisputesClient } from "./seller-disputes-client";

export default async function SellerDisputesPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/seller");
	return <SellerDisputesClient shopId={mine.shop.id} />;
}
