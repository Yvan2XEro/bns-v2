import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { TimelineEntry } from "@/src/lib/verification";

/**
 * The reviewer's own words, surfaced only for the two statuses a seller must
 * act on: a request sent back for more information, or one turned down.
 */
export function ReviewerMessage({ entry }: { entry: TimelineEntry }) {
	const c = useShopTheme();
	const { t } = useTranslation();

	if (entry.status !== "needs_info" && entry.status !== "rejected") {
		return null;
	}
	if (!entry.message) return null;

	const isRejected = entry.status === "rejected";
	const bg = isRejected ? c.dangerSoft : c.warningSoft;
	const fg = isRejected ? c.dangerText : c.warningText;

	return (
		<View
			accessibilityRole="alert"
			style={[styles.container, { backgroundColor: bg }]}
		>
			<Ionicons
				name={isRejected ? "close-circle" : "alert-circle"}
				size={18}
				color={fg}
			/>
			<View style={styles.body}>
				<Text style={[styles.title, { color: fg }]}>
					{t(`verification.reviewerMessage.title.${entry.status}`)}
				</Text>
				<Text style={[styles.message, { color: fg }]}>{entry.message}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		borderRadius: 12,
		padding: 12,
	},
	body: { flex: 1, gap: 2 },
	title: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	message: { fontSize: 13, fontFamily: Fonts.body },
});
