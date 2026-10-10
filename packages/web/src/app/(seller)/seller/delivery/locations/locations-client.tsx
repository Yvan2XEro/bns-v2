"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import {
	useDisableLocation,
	useShopLocations,
} from "~/hooks/use-delivery-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { districtName } from "~/lib/delivery-zone-form";
import type { ShopLocation } from "../../../../../../../api/src/payload-types";
import { DeliveryTabs } from "../delivery-tabs";
import { DeliveryUnavailableNotice } from "../unavailable-notice";
import { LocationDialog } from "./location-form";

type Target = { location: ShopLocation | null };

export function LocationsClient({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerDelivery");
	const tRoot = useTranslations();
	const { deliveryZonesEnabled } = useAppConfig();
	const locations = useShopLocations(shopId);
	const disable = useDisableLocation(shopId);
	const [target, setTarget] = useState<Target | null>(null);

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-bold text-2xl text-[#0F172A]">
					{t("locationsTitle")}
				</h1>
				{deliveryZonesEnabled && (
					<Button
						className="min-h-11"
						onClick={() => setTarget({ location: null })}
					>
						<Plus aria-hidden /> {t("addLocation")}
					</Button>
				)}
			</div>
			<DeliveryTabs />
			{!deliveryZonesEnabled && <DeliveryUnavailableNotice />}
			{deliveryZonesEnabled && locations.isPending && <LoadingRows rows={3} />}
			{deliveryZonesEnabled && locations.isError && (
				<LoadError
					title={`${t("locationsLoadError")} — ${resolveErrorMessage(locations.error, tRoot)}`}
					onRetry={() => void locations.refetch()}
				/>
			)}
			{deliveryZonesEnabled && locations.isSuccess && (
				<ul className="space-y-2">
					{locations.data.length === 0 && (
						<li className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-center text-[#64748B] text-sm">
							{t("locationsEmpty")}
						</li>
					)}
					{locations.data.map((location) => (
						<li
							key={location.id}
							className="space-y-1 rounded-2xl border border-[#E2E8F0] bg-white p-4 text-sm"
						>
							<p className="font-semibold text-[#0F172A]">
								{location.name}
								{location.isDefaultOrigin && (
									<span className="ml-2 rounded-full bg-[#EFF6FF] px-2 py-0.5 font-medium text-[#1E40AF] text-xs">
										{t("defaultOrigin")}
									</span>
								)}
								{!(location.active ?? true) && (
									<span className="ml-2 text-[#64748B] text-xs">
										{t("inactive")}
									</span>
								)}
							</p>
							<p className="text-[#334155]">
								{districtName(location.district)} · {location.landmark}
							</p>
							<p className="text-[#64748B]">
								{location.pickupEnabled ? t("pickupOn") : t("pickupOff")}
								{location.isDispatchOrigin ? ` · ${t("dispatchOrigin")}` : ""}
							</p>
							<div className="flex flex-wrap gap-2 pt-1">
								<Button
									variant="outline"
									className="min-h-11"
									onClick={() => setTarget({ location })}
								>
									{t("edit")}
								</Button>
								{(location.active ?? true) && (
									<Button
										variant="outline"
										className="min-h-11"
										disabled={disable.isPending}
										onClick={() => disable.mutate(location.id)}
									>
										{t("disable")}
									</Button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
			{disable.isError && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(disable.error, tRoot)}
				</p>
			)}
			{target && (
				<LocationDialog
					shopId={shopId}
					location={target.location}
					onClose={() => setTarget(null)}
				/>
			)}
		</div>
	);
}
