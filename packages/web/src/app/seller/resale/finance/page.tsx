import { redirect } from "next/navigation";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { ResellerFinanceClient } from "./reseller-finance-client";

export default async function ResellerFinancePage() {
	const [mine, config] = await Promise.all([
		getMyShop(),
		serverGet<{ resaleEnabled?: boolean }>("/api/public/config"),
	]);
	if (!mine?.shop || config?.resaleEnabled !== true) redirect("/seller");
	return <ResellerFinanceClient shopId={mine.shop.id} />;
}
