import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import type { ModerationShopSheet } from "@/src/types/api";
import type { ModerationPalette, Translate } from "./theme";
import { tonesOf } from "./tones";

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
	const k = tonesOf(c);

	if (!suspension.active) {
		return (
			<View
				style={[
					styles.card,
					styles.row,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<Ionicons
					name="checkmark-circle-outline"
					size={20}
					color={k.successText}
				/>
				<Text style={[styles.calmTitle, { color: c.text }]}>
					{t("moderation.noActiveSuspension")}
				</Text>
			</View>
		);
	}

	return (
		<View
			style={[
				styles.card,
				{ backgroundColor: c.dangerSoft, borderColor: k.dangerText },
			]}
		>
			<View style={styles.row}>
				<Ionicons name="ban" size={20} color={k.dangerText} />
				<Text style={[styles.sanctionTitle, { color: k.dangerText }]}>
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
				<Text style={[styles.meta, { color: c.text }]}>{suspension.note}</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: 1,
		padding: 16,
		gap: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		flexWrap: "wrap",
	},
	calmTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold, flex: 1 },
	sanctionTitle: { fontSize: 16, fontFamily: Fonts.displayBold, flex: 1 },
	body: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
});
