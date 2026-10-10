import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { DeliveryLocked } from "../delivery-locked";
import { LocationsClient } from "./locations-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SellerDelivery");
	return { title: t("locationsTitle") };
}

export default async function SellerLocationsPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");
	if (!can(mine.role, "settings.edit")) return <DeliveryLocked />;
	return <LocationsClient shopId={mine.shop.id} />;
}
