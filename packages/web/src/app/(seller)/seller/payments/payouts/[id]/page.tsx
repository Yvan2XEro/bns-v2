import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { PaymentsLocked } from "../../payments-locked";
import { PayoutDetailClient } from "./payout-detail-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Payments");
	return { title: t("payout_title") };
}

export default async function PayoutDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id: payoutId } = await params;
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");
	if (!can(mine.role, "payments.view")) return <PaymentsLocked />;

	return <PayoutDetailClient shopId={mine.shop.id} payoutId={payoutId} />;
}
