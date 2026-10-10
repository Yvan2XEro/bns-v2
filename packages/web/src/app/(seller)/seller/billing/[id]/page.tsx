import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { BillingLocked } from "../billing-locked";
import { InvoiceClient } from "./invoice-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Billing");
	return { title: t("title") };
}

export default async function InvoicePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const [mine, { id }] = await Promise.all([getMyShop(), params]);
	if (!mine?.shop) redirect("/shop/new");
	if (!can(mine.role, "payments.view")) return <BillingLocked />;

	return <InvoiceClient shopId={mine.shop.id} invoiceId={id} />;
}
