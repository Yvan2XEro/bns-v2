import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { timelineLabelKey } from "@/src/lib/purchaseActions";
import type { OrderTimelineEntry } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";
import { Card, purchaseText } from "./ui";

export function Timeline({ entries }: { entries: OrderTimelineEntry[] }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";

	return (
		<Card title={t("purchases.timeline")}>
			{entries.length === 0 ? (
				<Text style={[purchaseText.muted, { color: c.muted }]}>
					{t("purchases.timelineEmpty")}
				</Text>
			) : (
				<View style={[styles.list, { borderLeftColor: c.primarySoft }]}>
					{entries.map((entry) => (
						<View key={entry.id} style={styles.entry}>
							<Text style={[purchaseText.label, { color: c.text }]}>
								{t(timelineLabelKey(entry.type))}
							</Text>
							<Text style={[purchaseText.muted, { color: c.muted }]}>
								{formatOrderDate(entry.at, lang)}
								{entry.actorName ? ` · ${entry.actorName}` : ""}
							</Text>
							{entry.note ? (
								<Text style={[purchaseText.body, { color: c.body }]}>
									{entry.note}
								</Text>
							) : null}
						</View>
					))}
				</View>
			)}
		</Card>
	);
}

const styles = StyleSheet.create({
	list: { borderLeftWidth: 2, paddingLeft: 12, gap: 12 },
	entry: { gap: 2 },
});
