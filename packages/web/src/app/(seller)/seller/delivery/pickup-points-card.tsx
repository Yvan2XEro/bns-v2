"use client";

import { Lock, Plus, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import {
	useDisableLocation,
	useShopLocations,
} from "~/hooks/use-delivery-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { hoursSpans } from "~/lib/delivery-overview";
import { districtName } from "~/lib/delivery-zone-form";
import type { ShopLocation } from "../../../../../../api/src/payload-types";
import { LocationDialog } from "./locations/location-form";

function HoursSummary({ location }: { location: ShopLocation }) {
	const tDelivery = useTranslations("SellerDelivery");
	const tPage = useTranslations("DeliveryPage");
	const spans = hoursSpans(location.openingHours);
	return (
		<dl className="grid grid-cols-2 gap-3 rounded-[10px] bg-[#F8FAFC] px-3 py-2.5 text-[13px] sm:grid-cols-4">
			{spans.map((span) => (
				<div key={span.first}>
					<dt className="text-[#64748B]">
						{span.first === span.last
							? tDelivery(`day.${span.first}`)
							: tPage("dayRange", {
									first: tDelivery(`day.${span.first}`),
									last: tDelivery(`day.${span.last}`),
								})}
					</dt>
					<dd className="whitespace-nowrap font-semibold text-[#0F172A]">
						{span.hours
							? tPage("hoursRange", {
									opens: span.hours.opens,
									closes: span.hours.closes,
								})
							: tPage("closed")}
					</dd>
				</div>
			))}
			{location.pickupEnabled && location.preparationHours != null && (
				<div>
					<dt className="text-[#64748B]">{tPage("readyIn")}</dt>
					<dd className="whitespace-nowrap font-semibold text-[#0F172A]">
						{tPage("readyInHours", { hours: location.preparationHours })}
					</dd>
				</div>
			)}
		</dl>
	);
}

/** The shop's locations with their pickup hours; editing reuses the locations dialog. */
export function PickupPointsCard({ shopId }: { shopId: string }) {
	const tDelivery = useTranslations("SellerDelivery");
	const tPage = useTranslations("DeliveryPage");
	const tRoot = useTranslations();
	const locations = useShopLocations(shopId);
	const disable = useDisableLocation(shopId);
	const [target, setTarget] = useState<{
		location: ShopLocation | null;
	} | null>(null);

	return (
		<section
			aria-labelledby="pickup-points-title"
			className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
		>
			<h2
				id="pickup-points-title"
				className="border-[#F1F5F9] border-b px-[18px] py-3.5 font-bold text-[#0F172A] text-base"
			>
				{tPage("pickupTitle")}
			</h2>
			<div className="space-y-4 px-[18px] py-3.5">
				{locations.isPending && <LoadingRows rows={2} />}
				{locations.isError && (
					<LoadError
						title={`${tDelivery("locationsLoadError")} — ${resolveErrorMessage(locations.error, tRoot)}`}
						onRetry={() => void locations.refetch()}
					/>
				)}
				{locations.isSuccess && locations.data.length === 0 && (
					<p className="text-[#64748B] text-sm">
						{tDelivery("locationsEmpty")}
					</p>
				)}
				{locations.data?.map((location) => {
					const active = location.active ?? true;
					return (
						<div key={location.id} className="space-y-3">
							<div className="flex items-start gap-3">
								<span
									className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] ${location.pickupEnabled ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#F1F5F9] text-[#64748B]"}`}
								>
									<Store aria-hidden="true" className="h-5 w-5" />
								</span>
								<div className="min-w-0 flex-1">
									<p className="font-semibold text-[#0F172A]">
										{location.name}
										{location.isDefaultOrigin && (
											<span className="ml-2 rounded-full bg-[#EFF6FF] px-2 py-0.5 font-medium text-[#1E40AF] text-xs">
												{tDelivery("defaultOrigin")}
											</span>
										)}
									</p>
									<p className="text-[#64748B] text-[13px]">
										{location.landmark} · {districtName(location.district)}
									</p>
									<p className="text-[#64748B] text-xs">
										{location.pickupEnabled
											? tDelivery("pickupOn")
											: tDelivery("pickupOff")}
										{location.isDispatchOrigin
											? ` · ${tDelivery("dispatchOrigin")}`
											: ""}
										{!active && ` · ${tDelivery("inactive")}`}
									</p>
								</div>
								<div className="flex shrink-0 gap-2">
									<button
										type="button"
										onClick={() => setTarget({ location })}
										className="font-semibold text-[#1E40AF] text-[13px] hover:underline"
									>
										{tDelivery("edit")}
									</button>
									{active && (
										<button
											type="button"
											disabled={disable.isPending}
											onClick={() => disable.mutate(location.id)}
											className="font-semibold text-[#64748B] text-[13px] hover:underline disabled:opacity-50"
										>
											{tDelivery("disable")}
										</button>
									)}
								</div>
							</div>
							<HoursSummary location={location} />
						</div>
					);
				})}
				{disable.isError && (
					<p role="alert" className="text-red-700 text-sm">
						{resolveErrorMessage(disable.error, tRoot)}
					</p>
				)}
				<div className="flex flex-wrap items-center gap-3">
					<p className="flex flex-1 items-center gap-2 text-[#334155] text-[13px]">
						<Lock aria-hidden="true" className="h-4 w-4 text-[#1E40AF]" />
						{tPage("pickupCode")}
					</p>
					<button
						type="button"
						onClick={() => setTarget({ location: null })}
						className="flex h-9 items-center justify-center gap-1.5 rounded-lg border-[#CBD5E1] border-[1.5px] border-dashed px-4 font-semibold text-[#475569] text-[13px] hover:border-[#93C5FD] sm:w-60"
					>
						<Plus aria-hidden="true" className="h-4 w-4" />
						{tDelivery("addLocation")}
					</button>
				</div>
			</div>
			{target && (
				<LocationDialog
					shopId={shopId}
					location={target.location}
					onClose={() => setTarget(null)}
				/>
			)}
		</section>
	);
}
