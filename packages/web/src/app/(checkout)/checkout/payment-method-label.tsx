"use client";

import { useTranslations } from "next-intl";
import type { PaymentMethod } from "~/types/order";

/** Its own file for the same reason as `ProtectionFeeRow`: one namespace per file. */
export function PaymentMethodLabel({ method }: { method: PaymentMethod }) {
	const t = useTranslations("Payments");
	return (
		<>{method === "mobile_money" ? t("method_protected") : t("method_cod")}</>
	);
}
