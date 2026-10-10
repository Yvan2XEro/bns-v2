"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatOrderDate } from "~/lib/order-money";
import { holdRows } from "~/lib/seller-payments-view";
import { useLocaleKey } from "~/lib/use-locale-key";
import type { PaymentHoldView } from "~/types/payments";

/**
 * Every active hold on the shop or one of its orders — category only, never
 * the reason, and never an amount: the contract change that would attach
 * either to a hold row is parked (coordinator ruling).
 */
export function HoldList({ holds }: { holds: readonly PaymentHoldView[] }) {
	const t = useTranslations("Payments");
	const locale = useLocaleKey();
	const rows = holdRows(holds);

	return (
		<section aria-labelledby="holds-title" className="space-y-2">
			<h2 id="holds-title" className="font-semibold text-[#0F172A]">
				{t("seller_statusHolds")}
			</h2>
			{rows.length === 0 ? (
				<p className="text-[#64748B] text-sm">{t("seller_noHolds")}</p>
			) : (
				<ul className="space-y-2">
					{rows.map((row, index) => (
						<li
							key={`${row.scope}-${row.labelKey}-${index}`}
							className="flex gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3 text-sm"
						>
							<ShieldAlert
								aria-hidden="true"
								className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]"
							/>
							<div className="space-y-0.5">
								<p className="font-medium text-[#92400E]">{t(row.labelKey)}</p>
								<p className="text-[#78350F] text-xs">
									{t(row.descriptionKey)}
								</p>
								<p className="text-[#92400E] text-xs">
									{row.until
										? t("hold_until", {
												date: formatOrderDate(row.until, locale),
											})
										: t("hold_untilReleased")}
								</p>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
