import { redirect } from "next/navigation";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { PurchaseOrdersClient } from "./purchase-orders-client";

export default async function PurchaseOrdersPage({
	searchParams,
}: {
	searchParams: Promise<{ side?: string }>;
}) {
	const [mine, config, search] = await Promise.all([
		getMyShop(),
		serverGet<{ resaleEnabled?: boolean }>("/api/public/config"),
		searchParams,
	]);
	if (!mine?.shop || config?.resaleEnabled !== true) redirect("/seller");
	return (
		<PurchaseOrdersClient
			shopId={mine.shop.id}
			initialSide={search.side === "reseller" ? "reseller" : "supplier"}
		/>
	);
}
