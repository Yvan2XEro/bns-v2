import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import type { MovementRow } from "@/src/types/api";
import { formStyles as f } from "./formStyles";

/** The product editor's recent stock movements, newest first. */
export function ProductMovementsCard({
	movements,
}: {
	movements: MovementRow[];
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en-GB" : "fr-FR";

	if (movements.length === 0) return null;

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Text style={[f.sectionTitle, { color: c.text }]}>
				{t("product.latestMovements")}
			</Text>
			{movements.map((m) => (
				<View key={m.id} style={f.row}>
					<Text
						style={[
							styles.qty,
							{ color: m.quantity > 0 ? c.successText : c.dangerText },
						]}
					>
						{m.quantity > 0 ? `+${m.quantity}` : `−${Math.abs(m.quantity)}`}
					</Text>
					<View style={{ flex: 1 }}>
						<Text style={[f.label, { color: c.text }]}>
							{t(`stock.type_${m.type}`)}
							{m.variant.label ? ` · ${m.variant.label}` : ""}
						</Text>
						<Text style={[f.hint, { color: c.muted }]}>
							{[
								formatDate(
									m.createdAt,
									{ day: "numeric", month: "short" },
									locale,
								),
								m.note,
							]
								.filter(Boolean)
								.join(" · ")}
						</Text>
					</View>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	qty: { width: 40, fontSize: 15, fontFamily: Fonts.displayBold },
});
