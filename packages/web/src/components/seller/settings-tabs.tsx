import { getTranslations } from "next-intl/server";
import { SectionTabs } from "./section-tabs";

export async function SettingsTabs() {
	const t = await getTranslations("Seller");
	return (
		<SectionTabs
			tabs={[
				{ href: "/seller/settings", label: t("nav.settings"), exact: true },
				{ href: "/seller/settings/orders", label: t("nav.orderSettings") },
			]}
		/>
	);
}
