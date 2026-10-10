import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PaymentsTabs } from "~/components/seller/payments-tabs";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { BillingClient } from "./billing-client";
import { BillingLocked } from "./billing-locked";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Billing");
	return { title: t("title") };
}

/**
 * `payments.view` gates the whole screen: staff process orders but do not
 * read the shop's commission, and the billing route refuses them anyway.
 */
export default async function BillingPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");
	if (!can(mine.role, "payments.view")) return <BillingLocked />;

	return (
		<>
			<PaymentsTabs />
			<BillingClient shopId={mine.shop.id} />
		</>
	);
}
