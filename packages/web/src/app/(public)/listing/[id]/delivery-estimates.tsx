"use client";
import { Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useDeliveryEstimates } from "~/hooks/use-delivery-estimates";
import { formatXaf } from "~/lib/order-money";

export function DeliveryEstimates({
	listingId,
	eligible,
}: {
	listingId: string;
	eligible: boolean;
}) {
	const t = useTranslations("BuyBox");
	const locale = useLocale() === "fr" ? "fr" : "en";
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const query = useDeliveryEstimates(listingId, eligible);
	if (!eligible || !ordersEnabled || !deliveryZonesEnabled) return null;
	if (query.isPending)
		return (
			<output
				aria-label={t("estimateLoading")}
				className="my-4 block h-12 animate-pulse rounded-xl bg-slate-100"
			/>
		);
	if (query.isError)
		return (
			<p className="my-4 text-slate-500 text-sm">{t("estimateUnavailable")}</p>
		);
	if (!query.data?.perMethod.length) return null;
	return (
		<section
			aria-label={t("estimateTitle")}
			className="my-4 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700 text-sm"
		>
			<Truck
				aria-hidden="true"
				className="mt-0.5 h-4 w-4 shrink-0 text-blue-800"
			/>
			<div className="space-y-1">
				{query.data.perMethod.map((option) => (
					<p key={option.method}>
						{t("estimateCost", {
							method: t(`estimateMethod_${option.method}`),
							fee:
								option.cheapestFee === 0
									? t("estimateFree")
									: formatXaf(option.cheapestFee, locale),
							min: option.etaMinHours,
							max: option.etaMaxHours,
						})}
					</p>
				))}
				<p className="text-slate-500 text-xs">{t("estimateNotice")}</p>
			</div>
		</section>
	);
}
