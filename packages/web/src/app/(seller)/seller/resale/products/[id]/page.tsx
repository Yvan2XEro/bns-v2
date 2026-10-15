import { redirect } from "next/navigation";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { ProductResaleClient } from "./product-resale-client";

export default async function ProductResalePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const [mine, config, route] = await Promise.all([
		getMyShop(),
		serverGet<{ resaleEnabled?: boolean }>("/api/public/config"),
		params,
	]);
	if (!mine?.shop || config?.resaleEnabled !== true) redirect("/seller");
	return (
		<ProductResaleClient
			shopId={mine.shop.id}
			shopName={mine.shop.name}
			productId={route.id}
		/>
	);
}
