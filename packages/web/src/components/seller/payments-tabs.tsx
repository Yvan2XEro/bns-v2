"use client";

import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { SectionTabs } from "./section-tabs";

/** The tab row adapts to what the shop actually has: payouts need the
 * protected-payment flag, commission needs ordering. */
export function PaymentsTabs() {
	const t = useTranslations("Seller");
	const { ordersEnabled, protectedPaymentEnabled } = useAppConfig();
	const tabs = [
		...(protectedPaymentEnabled
			? [{ href: "/seller/payments", label: t("nav.payments") }]
			: []),
		...(ordersEnabled
			? [{ href: "/seller/billing", label: t("nav.billing") }]
			: []),
	];
	return tabs.length > 1 ? <SectionTabs tabs={tabs} /> : null;
}
