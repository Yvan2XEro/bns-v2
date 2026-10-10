"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatXaf } from "~/lib/order-money";
import type { OrderSettingsView } from "~/types/order";
import { useLocaleKey } from "../../billing/use-locale-key";

/** Prints the ceilings the API sent; it has no table of its own to fall back on. */
export function CapsNotice({
	caps,
}: {
	caps: NonNullable<OrderSettingsView["caps"]>;
}) {
	const t = useTranslations("Billing");
	const locale = useLocaleKey();

	return (
		<section
			aria-labelledby="caps-title"
			className="flex gap-3 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 text-sm"
		>
			<Info
				aria-hidden="true"
				className="mt-0.5 h-5 w-5 shrink-0 text-[#1E40AF]"
			/>
			<div className="space-y-1">
				<h2 id="caps-title" className="font-semibold text-[#1E3A8A]">
					{t("capsNotice")}
				</h2>
				<ul className="list-disc space-y-0.5 pl-4 text-[#1E3A8A]">
					<li>
						{t("capsMaxOrderTotal", {
							amount: formatXaf(caps.maxOrderTotal, locale),
						})}
					</li>
					<li>{t("capsMaxDailyOrders", { count: caps.maxDailyOrders })}</li>
					<li>{t("capsMaxOpenOrders", { count: caps.maxOpenOrders })}</li>
				</ul>
				<p className="text-[#475569] text-xs">{t("capsHint")}</p>
			</div>
		</section>
	);
}
