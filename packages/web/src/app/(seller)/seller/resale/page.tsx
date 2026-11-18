import { redirect } from "next/navigation";
import { resolveResaleTab } from "~/lib/resale-hub";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { ResaleHubClient } from "./resale-hub-client";

export default async function ResalePage({
	searchParams,
}: {
	searchParams: Promise<{ view?: string; tab?: string; supplier?: string }>;
}) {
	const [mine, config, search] = await Promise.all([
		getMyShop(),
		serverGet<{ resaleEnabled?: boolean }>("/api/public/config"),
		searchParams,
	]);
	if (!mine?.shop || config?.resaleEnabled !== true) redirect("/seller");
	// The server's badge is the expiry-aware level; "business" is level 3, the supplier tier.
	const supplierCapable = mine.shop.badge === "business";
	const { view, tab } = resolveResaleTab(
		search.view,
		search.tab,
		supplierCapable,
	);
	return (
		<ResaleHubClient
			shopId={mine.shop.id}
			view={view}
			tab={tab}
			supplierCapable={supplierCapable}
			supplierFilter={search.supplier ?? ""}
		/>
	);
}
