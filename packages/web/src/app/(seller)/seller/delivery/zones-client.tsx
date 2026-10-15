"use client";

import { Eye, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { useAppConfig } from "~/hooks/use-app-config";
import { useDisableZone, useShopZones } from "~/hooks/use-delivery-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { CourierCard } from "./courier-card";
import { PickupPointsCard } from "./pickup-points-card";
import { TestAddress } from "./test-address";
import { DeliveryUnavailableNotice } from "./unavailable-notice";
import { ZoneDrawer, type ZoneDrawerTarget } from "./zone-drawer";
import { ZoneRow } from "./zone-row";

/**
 * Zones, pickup points, the zone form and the partner-courier box on one
 * page. "Customer preview" is the address test: what a buyer at a given
 * address would be offered.
 */
export function ZonesClient({ shopId }: { shopId: string }) {
	const tDelivery = useTranslations("SellerDelivery");
	const tPage = useTranslations("DeliveryPage");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const { deliveryZonesEnabled, couriersEnabled, launchCities } =
		useAppConfig();
	const zones = useShopZones(shopId);
	const disable = useDisableZone(shopId);
	const [drawer, setDrawer] = useState<ZoneDrawerTarget | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);
	const cityLabel = (key: string) =>
		launchCities.find((c) => c.key === key)?.label ?? key;

	return (
		<div className="space-y-[18px]">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">
						{tPage("title")}
					</h1>
					<p className="text-[#64748B] text-sm">{tPage("subtitle")}</p>
				</div>
				{deliveryZonesEnabled && (
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							className="min-h-10"
							onClick={() => setPreviewOpen(true)}
						>
							<Eye aria-hidden /> {tPage("preview")}
						</Button>
						<Button
							className="min-h-10"
							onClick={() =>
								setDrawer({ zone: null, city: launchCities[0]?.key ?? "" })
							}
						>
							<Plus aria-hidden /> {tDelivery("addZone")}
						</Button>
					</div>
				)}
			</div>
			{!deliveryZonesEnabled && <DeliveryUnavailableNotice />}
			{deliveryZonesEnabled && (
				<div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]">
					<div className="min-w-0 space-y-[18px]">
						<section
							aria-labelledby="zones-title"
							className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2 border-[#F1F5F9] border-b px-[18px] py-3.5">
								<h2
									id="zones-title"
									className="font-bold text-[#0F172A] text-base"
								>
									{tDelivery("zonesTitle")}
								</h2>
								{launchCities.length > 0 && (
									<p className="text-[#64748B] text-[13px]">
										{tPage("openCities", {
											cities: launchCities.map((c) => c.label).join(", "),
										})}
									</p>
								)}
							</div>
							{zones.isPending && (
								<div className="p-[18px]">
									<LoadingRows rows={3} />
								</div>
							)}
							{zones.isError && (
								<div className="p-[18px]">
									<LoadError
										title={`${tDelivery("zonesLoadError")} — ${resolveErrorMessage(zones.error, tRoot)}`}
										onRetry={() => void zones.refetch()}
									/>
								</div>
							)}
							{zones.isSuccess && zones.data.length === 0 && (
								<p className="px-[18px] py-6 text-center text-[#64748B] text-sm">
									{tDelivery("zonesEmpty")}
								</p>
							)}
							{zones.isSuccess && zones.data.length > 0 && (
								<div className="overflow-x-auto">
									<table className="w-full min-w-[640px] text-left text-sm">
										<thead className="bg-[#F8FAFC] text-[#64748B] text-xs">
											<tr>
												<th className="px-[18px] py-2.5 font-medium">
													{tPage("colZone")}
												</th>
												<th className="px-3 py-2.5 font-medium">
													{tDelivery("columnDistricts")}
												</th>
												<th className="px-3 py-2.5 font-medium">
													{tDelivery("columnFee")}
												</th>
												<th className="px-3 py-2.5 font-medium">
													{tDelivery("columnFreeAbove")}
												</th>
												<th className="px-3 py-2.5 font-medium">
													{tDelivery("columnEta")}
												</th>
												<th className="px-3 py-2.5 font-medium">
													{tDelivery("fieldMethod")}
												</th>
												<th className="px-[18px] py-2.5">
													<span className="sr-only">{tPage("colActions")}</span>
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-[#F1F5F9]">
											{zones.data.map((zone) => (
												<ZoneRow
													key={zone.id}
													zone={zone}
													cityLabel={cityLabel(zone.city)}
													courierName={
														zone.courier && typeof zone.courier === "object"
															? zone.courier.name
															: null
													}
													locale={locale}
													selected={drawer?.zone?.id === zone.id}
													disabling={disable.isPending}
													onEdit={() => setDrawer({ zone, city: zone.city })}
													onDisable={() => disable.mutate(zone.id)}
												/>
											))}
										</tbody>
									</table>
								</div>
							)}
							{disable.isError && (
								<p role="alert" className="px-[18px] pb-3 text-red-700 text-sm">
									{resolveErrorMessage(disable.error, tRoot)}
								</p>
							)}
							<p className="bg-[#F8FAFC] px-[18px] py-[11px] text-[#64748B] text-[13px]">
								{tPage("zonesFootnote")}
							</p>
						</section>
						<PickupPointsCard shopId={shopId} />
					</div>
					<div className="space-y-[18px]">
						{drawer && (
							<ZoneDrawer
								key={drawer.zone?.id ?? "new"}
								shopId={shopId}
								target={drawer}
								onClose={() => setDrawer(null)}
							/>
						)}
						{couriersEnabled && (
							<CourierCard shopId={shopId} zones={zones.data ?? []} />
						)}
					</div>
				</div>
			)}
			<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{tPage("preview")}</DialogTitle>
					</DialogHeader>
					<TestAddress shopId={shopId} />
				</DialogContent>
			</Dialog>
		</div>
	);
}
