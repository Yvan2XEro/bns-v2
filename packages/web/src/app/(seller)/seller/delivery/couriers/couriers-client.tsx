"use client";

import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useAppConfig } from "~/hooks/use-app-config";
import {
	useAvailableCouriers,
	useShopZones,
} from "~/hooks/use-delivery-settings";
import { useOrderMoney } from "~/hooks/use-order-money";
import { resolveErrorMessage } from "~/lib/apiError";
import { districtName, zoneCourierId } from "~/lib/delivery-zone-form";
import { useLocaleKey } from "~/lib/use-locale-key";
import { DeliveryTabs } from "../delivery-tabs";
import { DeliveryUnavailableNotice } from "../unavailable-notice";

/** The registry as a shop sees it: who can serve its cities, at what tariff. Choosing one happens in a zone. */
export function CouriersClient({ shopId }: { shopId: string }) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("SellerDelivery");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const { couriersEnabled, deliveryZonesEnabled, launchCities } =
		useAppConfig();
	const couriers = useAvailableCouriers();
	const zones = useShopZones(shopId);
	const usage = (courierId: string) =>
		(zones.data ?? []).filter(
			(zone) => zone.method === "courier" && zoneCourierId(zone) === courierId,
		).length;

	return (
		<div className="space-y-5">
			<h1 className="font-bold text-2xl text-ink">{t("couriersTitle")}</h1>
			<DeliveryTabs />
			{(!couriersEnabled || !deliveryZonesEnabled) && (
				<DeliveryUnavailableNotice />
			)}
			{couriersEnabled && deliveryZonesEnabled && (
				<>
					<p className="text-ink-muted text-sm">{t("couriersBody")}</p>
					{couriers.isPending && <LoadingRows rows={3} />}
					{couriers.isError && (
						<LoadError
							title={`${t("couriersLoadError")} — ${resolveErrorMessage(couriers.error, tRoot)}`}
							onRetry={() => void couriers.refetch()}
						/>
					)}
					{couriers.isSuccess && couriers.data.length === 0 && (
						<p className="rounded-2xl border border-line bg-surface p-6 text-center text-ink-muted text-sm">
							{t("couriersEmpty")}
						</p>
					)}
					<ul className="space-y-3">
						{couriers.data?.map((courier) => (
							<li
								key={courier.id}
								className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-sm"
							>
								<p className="font-semibold text-ink">
									{courier.name}{" "}
									<span className="font-normal text-ink-muted">
										·{" "}
										{courier.cities
											.map(
												(key) =>
													launchCities.find((c) => c.key === key)?.label ?? key,
											)
											.join(", ")}
									</span>
								</p>
								<p className="text-ink-soft">
									{courier.supportsCod ? t("codYes") : t("codNo")} ·{" "}
									{t("zonesUsing", { count: usage(courier.id) })}
								</p>
								<ul className="space-y-0.5 text-ink-soft">
									{(courier.tariffs ?? []).map((tariff, index) => (
										<li
											key={`${tariff.city}-${tariff.district ?? "city"}-${index}`}
										>
											{tariff.district
												? districtName(tariff.district)
												: t("wholeCity")}
											: {formatOrderMoney(tariff.amount, locale)} ·{" "}
											{t("etaHours", {
												min: tariff.etaMinHours,
												max: tariff.etaMaxHours,
											})}
										</li>
									))}
								</ul>
							</li>
						))}
					</ul>
				</>
			)}
		</div>
	);
}
