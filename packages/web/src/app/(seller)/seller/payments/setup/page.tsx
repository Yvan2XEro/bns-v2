import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LoadingRows } from "~/components/seller/load-states";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { PaymentsLocked } from "../payments-locked";
import { SetupClient } from "./setup-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Payments");
	return { title: t("setup_title") };
}

/**
 * `payments.manage` is the owner-only action (onboarding, payout account);
 * this screen gates on `payments.view` like every other payments route, so
 * a manager can read it, and `startOnboarding`/`submitPayoutAccount` answer
 * `payout.ownerOnly` server-side for anyone less than the owner.
 */
export default async function PaymentSetupPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");
	if (!can(mine.role, "payments.view")) return <PaymentsLocked />;

	return (
		<Suspense fallback={<LoadingRows rows={4} />}>
			<SetupClient shopId={mine.shop.id} />
		</Suspense>
	);
}
