import { redirect } from "next/navigation";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { ResaleLinksClient } from "../links/resale-links-client";

export default async function SuppliersPage() {
	const [mine, config] = await Promise.all([
		getMyShop(),
		serverGet<{ resaleEnabled?: boolean }>("/api/public/config"),
	]);
	if (!mine?.shop || config?.resaleEnabled !== true) redirect("/seller");
	return <ResaleLinksClient shopId={mine.shop.id} side="reseller" />;
}
