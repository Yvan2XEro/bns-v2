import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "../theme";

/**
 * `TeamView.teamMembers` is `false` below verification level 2 — the
 * server's own capability flag, never a level number re-derived here (the
 * same reasoning `can` documents: never re-derive what the server already
 * states).
 */
export function TeamLocked() {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View style={styles.wrap}>
			<View style={[styles.iconCircle, { backgroundColor: c.neutralSoft }]}>
				<Ionicons name="lock-closed" size={24} color={c.muted} />
			</View>
			<Text style={[styles.message, { color: c.body }]}>
				{t("team.locked")}
			</Text>
			<Pressable
				onPress={() => router.push("/seller/verification" as never)}
				accessibilityRole="button"
				accessibilityLabel={t("team.lockedCta")}
				style={[styles.cta, { backgroundColor: c.primary }]}
			>
				<Text style={styles.ctaText}>{t("team.lockedCta")}</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		alignItems: "center",
		padding: 32,
		gap: 8,
	},
	iconCircle: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 8,
	},
	message: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		maxWidth: 320,
	},
	cta: {
		marginTop: 12,
		minHeight: 44,
		paddingHorizontal: 20,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	ctaText: { color: "#fff", fontSize: 14, fontFamily: Fonts.bodySemibold },
});
