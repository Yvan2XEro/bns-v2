"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatOrderDate } from "~/lib/order-money";
import type { BillingView } from "~/types/order";
import { useLocaleKey } from "./use-locale-key";

/** Says what is blocked, what is not, and what lifts it — never just "restricted". */
export function RestrictionBanner({
	restricted,
}: {
	restricted: NonNullable<BillingView["restricted"]>;
}) {
	const t = useTranslations("Billing");
	const locale = useLocaleKey();

	return (
		<section
			role="alert"
			aria-labelledby="restriction-title"
			className="flex gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm"
		>
			<ShieldAlert
				aria-hidden="true"
				className="mt-0.5 h-5 w-5 shrink-0 text-[#B91C1C]"
			/>
			<div className="space-y-1.5">
				<h2 id="restriction-title" className="font-semibold text-[#7F1D1D]">
					{t("restrictedTitle")}
					<span className="ml-2 font-normal text-[#991B1B] text-xs">
						{t("restrictedSince", {
							date: formatOrderDate(restricted.since, locale),
						})}
					</span>
				</h2>
				<p className="text-[#7F1D1D]">{t("restrictedBlocked")}</p>
				<p className="text-[#334155]">{t("restrictedAllowed")}</p>
				<p className="font-medium text-[#7F1D1D]">
					{restricted.reason === "staff"
						? t("restrictedClearStaff")
						: t("restrictedClearOverdue")}
				</p>
			</div>
		</section>
	);
}
