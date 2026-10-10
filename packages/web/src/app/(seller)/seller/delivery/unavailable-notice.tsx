"use client";

import { useTranslations } from "next-intl";

export function DeliveryUnavailableNotice() {
	const t = useTranslations("SellerDelivery");
	return (
		<output className="block rounded-2xl bg-[#FFFBEB] p-4 text-[#92400E] text-sm">
			{t("flagOff")}
		</output>
	);
}
