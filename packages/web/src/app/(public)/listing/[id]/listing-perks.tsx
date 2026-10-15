"use client";

import { RotateCcw, Store, Truck, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useAppConfig } from "~/hooks/use-app-config";
import { useOrderMoney } from "~/hooks/use-order-money";
import { type DeliveryLineInput, deliveryLine } from "~/lib/buy-box";

function Perk({
	icon,
	title,
	detail,
}: {
	icon: ReactNode;
	title: string;
	detail: string | null;
}) {
	return (
		<li className="flex items-start gap-2.5 text-[#334155] text-sm">
			<span className="mt-0.5 shrink-0 text-[#1E40AF]">{icon}</span>
			<span className="flex flex-col">
				<strong className="font-semibold text-[#0F172A]">{title}</strong>
				{detail && <span className="text-[#64748B] text-[13px]">{detail}</span>}
			</span>
		</li>
	);
}

/**
 * What ordering here gets the buyer, from settings the checkout itself
 * applies: the shop's delivery fee and pickup point, the product's own COD
 * switch (checkout refuses COD when it is off) and the market's withdrawal
 * period. With delivery zones on, `DeliveryEstimates` speaks for delivery.
 */
export function ListingPerks({
	delivery,
	handlingHours,
	codAllowed,
}: {
	delivery: DeliveryLineInput;
	handlingHours: number | null;
	codAllowed: boolean;
}) {
	const t = useTranslations("BuyBox");
	const formatOrderMoney = useOrderMoney();
	const locale = useLocale() === "en" ? "en" : "fr";
	const { launchCities, withdrawalDays, deliveryZonesEnabled } = useAppConfig();
	const line = deliveryZonesEnabled
		? null
		: deliveryLine(delivery, launchCities);
	const icon = "h-[18px] w-[18px]";

	return (
		<ul className="space-y-3 border-[#E2E8F0] border-t pt-4">
			{line?.delivery && (
				<Perk
					icon={<Truck aria-hidden="true" className={icon} />}
					title={t("perkDelivery", {
						city: line.delivery.city,
						fee: formatOrderMoney(line.delivery.fee, locale),
					})}
					detail={
						handlingHours
							? t("perkDeliveryWithin", { hours: handlingHours })
							: t("perkDeliveryByShop")
					}
				/>
			)}
			{line?.pickup && (
				<Perk
					icon={<Store aria-hidden="true" className={icon} />}
					title={t("perkPickup")}
					detail={delivery.pickupAddress}
				/>
			)}
			{codAllowed && (
				<Perk
					icon={<Wallet aria-hidden="true" className={icon} />}
					title={t("codBadge")}
					detail={t("perkCodDetail")}
				/>
			)}
			<Perk
				icon={<RotateCcw aria-hidden="true" className={icon} />}
				title={t("perkWithdrawal", { days: withdrawalDays })}
				detail={t("perkWithdrawalDetail")}
			/>
		</ul>
	);
}
