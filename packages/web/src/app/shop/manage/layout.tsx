import { redirect } from "next/navigation";
import { SellerShell } from "~/components/seller/seller-shell";
import { getMyShop } from "~/lib/server-shop";

export default async function ShopManageLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const mine = await getMyShop();
	const shop = mine?.shop;
	if (!mine || !shop || shop.status === "closed") redirect("/shop/new");
	return <SellerShell mine={{ ...mine, shop }}>{children}</SellerShell>;
}
