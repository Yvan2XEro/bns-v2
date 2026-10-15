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
				<View>
					{entries.map((entry, index) => {
						const latest = index === entries.length - 1;
						return (
							<View key={entry.id} style={styles.entry}>
								<View style={styles.rail}>
									<View
										style={[
											styles.dot,
											latest
												? {
														backgroundColor: c.primary,
														borderColor: c.primarySoft,
													}
												: { backgroundColor: c.card, borderColor: c.border },
										]}
									/>
									{latest ? null : (
										<View
											style={[styles.line, { backgroundColor: c.border }]}
										/>
									)}
								</View>
								<View style={styles.text}>
									<Text
										style={[
											purchaseText.label,
											{ color: latest ? c.primary : c.text },
										]}
									>
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
							</View>
						);
					})}
				</View>
			)}
		</Card>
	);
}

const styles = StyleSheet.create({
	entry: { flexDirection: "row", gap: 12 },
	rail: { width: 14, alignItems: "center" },
	dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, marginTop: 3 },
	line: { flex: 1, width: 2, marginVertical: 2 },
	text: { flex: 1, gap: 2, paddingBottom: 14 },
});
