import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
 * process orders but do not read the shop's ledger. The screen itself does
 * not check `protectedPaymentEnabled` — the ledger keeps posting and the
 * payouts keep running while the flag is off (global constraint: turning it
 * off never strands money in flight), so an owner with history here must
 * still be able to read it. Only the sidebar entry and `/setup` read the flag.
 */
export default async function PaymentsPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");
	if (!can(mine.role, "payments.view")) return <PaymentsLocked />;

	return <PaymentsClient shopId={mine.shop.id} />;
}
