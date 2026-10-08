import { redirect } from "next/navigation";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { PurchaseOrderDetailClient } from "./purchase-order-detail-client";

export default async function PurchaseOrderDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ side?: string }>;
}) {
	const [mine, config, route, search] = await Promise.all([
		getMyShop(),
		serverGet<{ resaleEnabled?: boolean }>("/api/public/config"),
		params,
		searchParams,
	]);
	if (!mine?.shop || config?.resaleEnabled !== true) redirect("/seller");
	const side = search.side === "reseller" ? "reseller" : "supplier";
	return (
		<PurchaseOrderDetailClient
			shopId={mine.shop.id}
			purchaseOrderId={route.id}
			side={side}
		/>
	);
}
