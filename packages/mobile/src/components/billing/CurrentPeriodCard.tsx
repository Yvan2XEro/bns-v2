import { StyleSheet, Text, View } from "react-native";
import { InkCard, inkText, ON_INK } from "@/src/components/ui/InkCard";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
import type { BillingView } from "@/src/types/order";
import { useLocaleKey } from "./useLocaleKey";

export function CurrentPeriodCard({
	period,
}: {
	period: BillingView["currentPeriod"];
}) {
	const { t } = useTranslation();
	const locale = useLocaleKey();

	return (
		<InkCard>
			<Text style={inkText.label}>
				{t("billing.currentPeriod")} ·{" "}
				{t("billing.periodRange", {
					start: formatOrderDate(period.periodStart, locale),
					end: formatOrderDate(period.periodEnd, locale),
				})}
			</Text>
			<Text style={[inkText.label, styles.accrued]}>
				{t("billing.accruedSoFar")}
			</Text>
			<Text style={inkText.hero}>{formatXaf(period.accrued, locale)}</Text>
			<View style={inkText.rule} />
			<Text style={[inkText.value, { color: ON_INK.text }]}>
				{t("billing.ordersCount", { count: period.ordersCount })}
			</Text>
			<Text style={[inkText.footnote, styles.hint]}>
				{t("billing.currentPeriodHint")}
			</Text>
		</InkCard>
	);
}

const styles = StyleSheet.create({
	accrued: { marginTop: 6 },
	hint: { marginTop: 4, lineHeight: 16 },
});
