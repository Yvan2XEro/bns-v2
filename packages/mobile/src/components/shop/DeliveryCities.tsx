import { Text } from "react-native";
import { Fonts } from "@/constants/theme";
import { LAUNCH_CITIES } from "../../../../api/src/lib/launchCities";
import { useAppConfig } from "../../contexts/AppConfigContext";
import { useDeliveryCities } from "../../hooks/usePickupPoints";
import { useTranslation } from "../../lib/i18n";
import { useShopTheme } from "./theme";

export function DeliveryCities({ shopId }: { shopId: string }) {
	const { t } = useTranslation();
	const c = useShopTheme();
	const { data } = useDeliveryCities(shopId);
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	if (!ordersEnabled || !deliveryZonesEnabled) return null;
	if (!data?.deliveryCities.length) return null;
	return (
		<Text style={{ color: c.body, fontFamily: Fonts.body, fontSize: 13 }}>
			{t("shop.deliveryCities", {
				cities: data.deliveryCities
					.map((city) => LAUNCH_CITIES[city].label)
					.join(", "),
			})}
		</Text>
	);
}
