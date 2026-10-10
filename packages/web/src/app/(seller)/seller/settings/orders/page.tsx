import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SettingsTabs } from "~/components/seller/settings-tabs";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { BillingLocked } from "../../billing/billing-locked";
import { OrderSettingsClient } from "./order-settings-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Billing");
	return { title: t("orderSettingsTitle") };
}

/**
 * Reading is `payments.view` (the view carries the shop's COD caps), writing
 * is `settings.edit`; the matrix answers both, the page compares no role.
 */
export default async function OrderSettingsPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");
	if (!can(mine.role, "payments.view")) {
		return (
			<>
				<SettingsTabs />
				<BillingLocked />
			</>
		);
	}

	return (
		<>
			<SettingsTabs />
			<OrderSettingsClient
				shopId={mine.shop.id}
				canEdit={can(mine.role, "settings.edit")}
			/>
		</>
	);
}
