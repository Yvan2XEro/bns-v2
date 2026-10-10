import { redirect } from "next/navigation";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { ResaleOfferedClient } from "./resale-offered-client";

export default async function ResaleOfferedPage() {
	const [mine, config] = await Promise.all([
		getMyShop(),
		serverGet<{ resaleEnabled?: boolean }>("/api/public/config"),
	]);
	if (!mine?.shop || config?.resaleEnabled !== true) redirect("/seller");
	return <ResaleOfferedClient shopId={mine.shop.id} />;
}
