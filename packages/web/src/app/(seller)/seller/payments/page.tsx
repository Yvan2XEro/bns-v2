import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PaymentsTabs } from "~/components/seller/payments-tabs";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { PaymentsClient } from "./payments-client";
import { PaymentsLocked } from "./payments-locked";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Payments");
	return { title: t("seller_title") };
}

/**
 * `payments.view` gates the whole screen, same as `/seller/billing`: staff
 * process orders but do not read the shop's ledger.
 */
export default async function PaymentsPage() {
	const [mine, config] = await Promise.all([
		getMyShop(),
		serverGet<{ protectedPaymentEnabled?: boolean }>("/api/public/config"),
	]);
	if (!mine?.shop) redirect("/shop/new");
	if (!can(mine.role, "payments.view")) return <PaymentsLocked />;
	// A COD-only shop has no payouts: the hub entry lands on commission rather
	// than an empty payouts shell.
	if (config?.protectedPaymentEnabled !== true) redirect("/seller/billing");

	return (
		<>
			<PaymentsTabs />
			<PaymentsClient shopId={mine.shop.id} />
		</>
	);
}
