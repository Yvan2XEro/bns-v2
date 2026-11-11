import { Text } from "react-native";
import { Fonts } from "@/constants/theme";
import { useAppConfig } from "../../contexts/AppConfigContext";
import { useDeliveryCities } from "../../hooks/usePickupPoints";
import { useTranslation } from "../../lib/i18n";
import { cityLabel } from "../../lib/sellerOrders";
import { useShopTheme } from "./theme";

/**
 * The API reads cities from the market-cities collection, which can hold a
 * city the bundled launch list does not know yet. `cityLabel` falls back to
 * the stored name instead of indexing `LAUNCH_CITIES` and throwing.
 */
export function DeliveryCities({ shopId }: { shopId: string }) {
	const { t } = useTranslation();
	const c = useShopTheme();
	const { data } = useDeliveryCities(shopId);
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	if (!ordersEnabled || !deliveryZonesEnabled) return null;
	const cities = (data?.deliveryCities ?? [])
		.filter((city) => typeof city === "string" && city.length > 0)
		.map((city) => cityLabel(city));
	if (!cities.length) return null;
	return (
		<Text
			style={{
				color: c.body,
				fontFamily: Fonts.body,
				fontSize: 14,
				lineHeight: 20,
			}}
		>
			{t("shop.deliveryCities", { cities: cities.join(", ") })}
		</Text>
	);
}
