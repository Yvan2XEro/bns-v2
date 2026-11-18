"use client";

import { useTranslations } from "next-intl";

export function DeliveryUnavailableNotice() {
	const t = useTranslations("SellerDelivery");
	return (
		<output className="block rounded-2xl bg-warn-faint p-4 text-sm text-warn-ink">
			{t("flagOff")}
		</output>
	);
}
