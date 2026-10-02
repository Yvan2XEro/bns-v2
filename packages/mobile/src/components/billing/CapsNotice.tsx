import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { OrderSettingsView } from "@/src/types/order";
import { billingStyles as s } from "./billingStyles";
import { useLocaleKey } from "./useLocaleKey";

/** Prints the ceilings the API sent; it has no table of its own to fall back on. */
export function CapsNotice({
	caps,
}: {
	caps: NonNullable<OrderSettingsView["caps"]>;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();

	return (
		<View
			style={[
				s.card,
				{
					backgroundColor: c.primarySoft,
					borderColor: c.primary,
					flexDirection: "row",
					gap: 10,
				},
			]}
		>
			<Ionicons name="information-circle-outline" size={20} color={c.primary} />
			<View style={{ flex: 1, gap: 4 }}>
				<Text style={[s.cardTitle, { color: c.text }]}>
					{t("billing.capsNotice")}
				</Text>
				<Text style={[s.body, { color: c.body }]}>
					{`• ${t("billing.capsMaxOrderTotal", { amount: formatXaf(caps.maxOrderTotal, locale) })}`}
				</Text>
				<Text style={[s.body, { color: c.body }]}>
					{`• ${t("billing.capsMaxDailyOrders", { count: caps.maxDailyOrders })}`}
				</Text>
				<Text style={[s.body, { color: c.body }]}>
					{`• ${t("billing.capsMaxOpenOrders", { count: caps.maxOpenOrders })}`}
				</Text>
				<Text style={[s.meta, { color: c.muted }]}>
					{t("billing.capsHint")}
				</Text>
			</View>
		</View>
	);
}
