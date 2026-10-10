import { redirect } from "next/navigation";
import { SellerShell } from "~/components/seller/seller-shell";
import { getMyShop } from "~/lib/server-shop";

export default async function SellerLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const mine = await getMyShop();
	const shop = mine?.shop;
	// The flag gates entry points, not an existing owner's own space.
	if (!mine || !shop || shop.status === "closed") redirect("/shop/new");

	return <SellerShell mine={{ ...mine, shop }}>{children}</SellerShell>;
}
