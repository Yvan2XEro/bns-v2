"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import { useShopZones } from "~/hooks/use-delivery-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { groupZonesByCity } from "~/lib/delivery-zone-form";
import { DeliveryTabs } from "./delivery-tabs";
import { TestAddress } from "./test-address";
import { DeliveryUnavailableNotice } from "./unavailable-notice";
import { ZoneDrawer, type ZoneDrawerTarget } from "./zone-drawer";
import { ZoneRow } from "./zone-row";

export function ZonesClient({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerDelivery");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const { deliveryZonesEnabled, launchCities } = useAppConfig();
	const zones = useShopZones(shopId);
	const [drawer, setDrawer] = useState<ZoneDrawerTarget | null>(null);

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-bold text-2xl text-[#0F172A]">{t("zonesTitle")}</h1>
				{deliveryZonesEnabled && (
					<Button
						className="min-h-11"
						onClick={() =>
							setDrawer({ zone: null, city: launchCities[0]?.key ?? "" })
						}
					>
						<Plus aria-hidden /> {t("addZone")}
					</Button>
				)}
			</div>
			<DeliveryTabs />
			{!deliveryZonesEnabled && <DeliveryUnavailableNotice />}
			{deliveryZonesEnabled && zones.isPending && <LoadingRows rows={4} />}
			{deliveryZonesEnabled && zones.isError && (
				<LoadError
					title={`${t("zonesLoadError")} — ${resolveErrorMessage(zones.error, tRoot)}`}
					onRetry={() => void zones.refetch()}
				/>
			)}
			{zones.isSuccess && deliveryZonesEnabled && (
				<>
					{zones.data.length === 0 && (
						<p className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-center text-[#64748B] text-sm">
							{t("zonesEmpty")}
						</p>
					)}
					{groupZonesByCity(zones.data).map((group) => (
						<section key={group.city} className="space-y-2">
							<h2 className="font-semibold text-[#0F172A]">
								{launchCities.find((c) => c.key === group.city)?.label ??
									group.city}
							</h2>
							<ul className="space-y-2">
								{group.zones.map((zone) => (
									<ZoneRow
										key={zone.id}
										shopId={shopId}
										zone={zone}
										locale={locale}
										onEdit={() => setDrawer({ zone, city: zone.city })}
									/>
								))}
							</ul>
						</section>
					))}
					<TestAddress shopId={shopId} />
				</>
			)}
			{drawer && (
				<ZoneDrawer
					shopId={shopId}
					target={drawer}
					onClose={() => setDrawer(null)}
				/>
			)}
		</div>
	);
}
