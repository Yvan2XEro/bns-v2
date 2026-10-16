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
		<dl className="grid grid-cols-2 gap-3 rounded-[10px] bg-canvas px-3 py-2.5 text-[13px] sm:grid-cols-4">
			{spans.map((span) => (
				<div key={span.first}>
					<dt className="text-ink-muted">
						{span.first === span.last
							? tDelivery(`day.${span.first}`)
							: tPage("dayRange", {
									first: tDelivery(`day.${span.first}`),
									last: tDelivery(`day.${span.last}`),
								})}
					</dt>
					<dd className="whitespace-nowrap font-semibold text-ink">
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
					<dt className="text-ink-muted">{tPage("readyIn")}</dt>
					<dd className="whitespace-nowrap font-semibold text-ink">
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
			className="overflow-hidden rounded-2xl border border-line bg-surface"
		>
			<h2
				id="pickup-points-title"
				className="border-subtle border-b px-[18px] py-3.5 font-bold text-base text-ink"
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
					<p className="text-ink-muted text-sm">
						{tDelivery("locationsEmpty")}
					</p>
				)}
				{locations.data?.map((location) => {
					const active = location.active ?? true;
					return (
						<div key={location.id} className="space-y-3">
							<div className="flex items-start gap-3">
								<span
									className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] ${location.pickupEnabled ? "bg-ok-soft text-ok-ink-soft" : "bg-subtle text-ink-muted"}`}
								>
									<Store aria-hidden="true" className="h-5 w-5" />
								</span>
								<div className="min-w-0 flex-1">
									<p className="font-semibold text-ink">
										{location.name}
										{location.isDefaultOrigin && (
											<span className="ml-2 rounded-full bg-[var(--shop-accent-soft,var(--c-brand-soft))] px-2 py-0.5 font-medium text-[var(--shop-accent-text,var(--c-brand))] text-xs">
												{tDelivery("defaultOrigin")}
											</span>
										)}
									</p>
									<p className="text-[13px] text-ink-muted">
										{location.landmark} · {districtName(location.district)}
									</p>
									<p className="text-ink-muted text-xs">
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
										className="font-semibold text-[13px] text-[var(--shop-accent-text,var(--c-brand))] hover:underline"
									>
										{tDelivery("edit")}
									</button>
									{active && (
										<button
											type="button"
											disabled={disable.isPending}
											onClick={() => disable.mutate(location.id)}
											className="font-semibold text-[13px] text-ink-muted hover:underline disabled:opacity-50"
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
					<p className="flex flex-1 items-center gap-2 text-[13px] text-ink-soft">
						<Lock
							aria-hidden="true"
							className="h-4 w-4 text-[var(--shop-accent-text,var(--c-brand))]"
						/>
						{tPage("pickupCode")}
					</p>
					<button
						type="button"
						onClick={() => setTarget({ location: null })}
						className="flex h-9 items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-line-strong border-dashed px-4 font-semibold text-[13px] text-ink-mid hover:border-[var(--shop-accent-border,var(--c-brand-line))] sm:w-60"
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
