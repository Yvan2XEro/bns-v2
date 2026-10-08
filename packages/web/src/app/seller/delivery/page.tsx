import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { DeliveryLocked } from "./delivery-locked";
import { ZonesClient } from "./zones-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SellerDelivery");
	return { title: t("zonesTitle") };
}

/** `settings.edit` gates the zone routes themselves, so the page asks the same matrix. */
export default async function SellerDeliveryPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");
	if (!can(mine.role, "settings.edit")) return <DeliveryLocked />;
	return <ZonesClient shopId={mine.shop.id} />;
}
