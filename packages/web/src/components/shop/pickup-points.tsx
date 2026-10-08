"use client";
import { useLocale, useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { usePickupPoints } from "~/hooks/use-pickup-points";
import { googleMapsUrl } from "~/lib/checkout-form";
import { formatXaf } from "~/lib/order-money";
import { pickupHours } from "../../../../api/src/contracts/publicPickupPoint";
import { LAUNCH_CITIES } from "../../../../api/src/lib/launchCities";

export function PickupPoints({ handle }: { handle: string }) {
	const t = useTranslations("Shop");
	const locale = useLocale() === "fr" ? "fr" : "en";
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const query = usePickupPoints(handle);
	if (!ordersEnabled || !deliveryZonesEnabled) return null;
	if (query.isPending)
		return (
			<output
				aria-label={t("pickupLoading")}
				className="mt-4 block h-24 animate-pulse rounded-xl bg-slate-100"
			/>
		);
	if (query.isError)
		return (
			<p className="mt-4 text-slate-500 text-sm">{t("pickupUnavailable")}</p>
		);
	if (!query.data?.length) return null;
	return (
		<section
			className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm"
			aria-label={t("pickupTitle")}
		>
			<h2 className="font-semibold text-slate-900">{t("pickupTitle")}</h2>
			{query.data.map((point) => (
				<div
					key={point.id}
					className="space-y-1 border-slate-100 border-t pt-3 text-slate-600"
				>
					<h3 className="font-medium text-slate-900">{point.name}</h3>
					<p>
						{LAUNCH_CITIES[point.city].label} · {point.district}
					</p>
					{point.address && <p>{point.address}</p>}
					<p>{point.landmark}</p>
					{pickupHours(point.openingHours, locale).map((hours) => (
						<p key={hours}>{hours}</p>
					))}
					{point.openingHoursNote && <p>{point.openingHoursNote}</p>}
					<p>
						{t("pickupFee", {
							fee:
								point.pickupFee === 0
									? t("pickupFree")
									: formatXaf(point.pickupFee, locale),
						})}
					</p>
					<p>
						{t("pickupPreparation", {
							hours: point.preparationHours,
							days: point.holdDays,
						})}
					</p>
					<a
						href={googleMapsUrl(point.gps.lat, point.gps.lng)}
						target="_blank"
						rel="noopener noreferrer"
						className="flex min-h-11 items-center font-medium text-blue-800 underline"
					>
						{t("pickupMaps", { name: point.name })}
					</a>
				</div>
			))}
		</section>
	);
}
