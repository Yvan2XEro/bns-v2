"use client";

import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useOrderMoney } from "~/hooks/use-order-money";
import { useDeliveryCities, usePickupPoints } from "~/hooks/use-pickup-points";
import { useRememberedCity } from "~/hooks/use-remembered-city";
import { cartDeliveryPreview, launchCityFor } from "~/lib/delivery-preview";

/**
 * "Livraison à partir de … à Douala · Retrait gratuit" under a shop's lines:
 * a floor from the shop's public zones for the buyer's remembered city. The
 * method and the fee are still chosen and quoted at checkout.
 */
export function CartDeliveryHint({
	shopId,
	handle,
}: {
	shopId: string;
	handle: string;
}) {
	const t = useTranslations("Cart");
	const formatOrderMoney = useOrderMoney();
	const { launchCities } = useAppConfig();
	const cities = useDeliveryCities(shopId);
	const pickups = usePickupPoints(handle);
	const city = launchCityFor(useRememberedCity(), launchCities);
	const preview = cartDeliveryPreview(city, cities.data, pickups.data);
	if (!preview) return null;
	const parts = [
		preview.delivery &&
			t("estimateDeliveryFrom", {
				fee: formatOrderMoney(preview.delivery.fromFee),
				city: preview.delivery.city,
			}),
		preview.pickupFromFee === 0
			? t("estimatePickupFree")
			: preview.pickupFromFee !== null &&
				t("estimatePickupFrom", {
					fee: formatOrderMoney(preview.pickupFromFee),
				}),
	].filter(Boolean);
	return (
		<p className="text-ink-muted text-xs">
			{parts.join(" · ")} · {t("estimateNote")}
		</p>
	);
}
