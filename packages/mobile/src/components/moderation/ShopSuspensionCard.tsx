import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import type { ModerationShopSheet } from "@/src/types/api";
import type { ModerationPalette, Translate } from "./theme";

interface ShopSuspensionCardProps {
	suspension: ModerationShopSheet["suspension"];
	c: ModerationPalette;
	t: Translate;
}

/** Active-suspension detail, or the one-line "nothing in progress" state. */
export function ShopSuspensionCard({
	suspension,
	c,
	t,
}: ShopSuspensionCardProps) {
	if (!suspension.active) {
		return (
			<Text style={[styles.meta, { color: c.muted }]}>
				{t("moderation.noActiveSuspension")}
			</Text>
		);
	}

	return (
		<View
			style={[
				styles.card,
				{ backgroundColor: c.dangerSoft, borderColor: c.danger },
			]}
		>
			<View style={styles.row}>
				<Ionicons name="ban" size={18} color={c.danger} />
				<Text style={[styles.sanctionTitle, { color: c.danger }]}>
					{suspension.indefinite
						? t("moderation.shopSuspendedIndefinitely")
						: t("moderation.suspendedUntil", {
								date: formatDate(String(suspension.until)),
							})}
				</Text>
			</View>
			{suspension.reason ? (
				<Text style={[styles.body, { color: c.text }]}>
					{t(`report.${suspension.reason}`)}
				</Text>
			) : null}
			{suspension.note ? (
				<Text style={[styles.meta, { color: c.muted }]}>{suspension.note}</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 10,
	},
	row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
	sanctionTitle: { fontSize: 14, fontFamily: Fonts.displayBold, flex: 1 },
	body: { fontSize: 14, fontFamily: Fonts.body },
	meta: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
});
