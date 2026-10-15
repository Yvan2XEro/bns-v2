"use client";
import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useDeliveryCities } from "~/hooks/use-pickup-points";

export function DeliveryCities({ shopId }: { shopId: string }) {
	const t = useTranslations("Shop");
	const { data } = useDeliveryCities(shopId);
	const { ordersEnabled, deliveryZonesEnabled, launchCities } = useAppConfig();
	if (!ordersEnabled || !deliveryZonesEnabled) return null;
	if (!data?.deliveryCities.length) return null;
	return (
		<p className="mt-4 text-slate-600 text-sm">
			{t("deliveryCities", {
				cities: data.deliveryCities
					.map(
						(key) =>
							launchCities.find((city) => city.key === key)?.label ?? key,
					)
					.join(", "),
			})}
		</p>
	);
}
