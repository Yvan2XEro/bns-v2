import { redirect } from "next/navigation";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { ResaleCatalogueClient } from "./resale-catalogue-client";

export default async function ResaleCataloguePage() {
	const [mine, config] = await Promise.all([
		getMyShop(),
		serverGet<{ resaleEnabled?: boolean }>("/api/public/config"),
	]);
	if (!mine?.shop || config?.resaleEnabled !== true) redirect("/seller");
	return <ResaleCatalogueClient shopId={mine.shop.id} />;
}
