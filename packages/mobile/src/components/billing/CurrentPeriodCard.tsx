import { Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
import type { BillingView } from "@/src/types/order";
import { billingStyles as s } from "./billingStyles";
import { useLocaleKey } from "./useLocaleKey";

export function CurrentPeriodCard({
	period,
}: {
	period: BillingView["currentPeriod"];
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();

	return (
		<View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Text style={[s.cardTitle, { color: c.text }]}>
				{t("billing.currentPeriod")}
			</Text>
			<Text style={[s.meta, { color: c.muted }]}>
				{t("billing.periodRange", {
					start: formatOrderDate(period.periodStart, locale),
					end: formatOrderDate(period.periodEnd, locale),
				})}
			</Text>
			<Text style={[s.meta, { color: c.muted, marginTop: 6 }]}>
				{t("billing.accruedSoFar")}
			</Text>
			<Text style={[s.amount, { color: c.text }]}>
				{formatXaf(period.accrued, locale)}
			</Text>
			<Text style={[s.body, { color: c.body }]}>
				{t("billing.ordersCount", { count: period.ordersCount })}
			</Text>
			<Text style={[s.meta, { color: c.muted }]}>
				{t("billing.currentPeriodHint")}
			</Text>
		</View>
	);
}
