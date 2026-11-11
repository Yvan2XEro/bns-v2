import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

// Deliberately no link out to the web listing page: that page renders the paid
// boost dialog, so sending the user there from inside the app is an App Review
// 3.1.1 external-purchase link-out for a digital in-app benefit.

export default function BoostModal() {
	const { listingId } = useLocalSearchParams<{ listingId: string }>();
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();

	const c = isDark ? Colors.dark : Colors.light;
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const bodyColor = c.body;
	const mutedColor = c.mutedForeground;
	const borderColor = c.border;
	// White stays legible on the deeper indigo in dark mode.
	const filledColor = c.primaryFill;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<Pressable
				onPress={() => router.dismiss()}
				style={styles.closeBtn}
				accessibilityRole="button"
				accessibilityLabel={t("common.close")}
			>
				<Ionicons name="close" size={24} color={textColor} />
			</Pressable>

			<View style={[styles.container, centeredContent]}>
				<View style={styles.header}>
					<View
						style={[styles.rocketIconWrap, { backgroundColor: c.sun }]}
						accessibilityElementsHidden
						importantForAccessibility="no-hide-descendants"
					>
						<Ionicons name="flash" size={36} color={c.sunForeground} />
					</View>
					<Text
						style={[styles.title, { color: textColor }]}
						accessibilityRole="header"
					>
						{t("boost.boostTitle")}
					</Text>
					<Text style={[styles.subtitle, { color: bodyColor }]}>
						{t("boost.boostSubtitle")}
					</Text>
				</View>

				<View
					style={[
						styles.unavailableCard,
						{
							backgroundColor: cardBg,
							borderColor,
						},
					]}
				>
					<View
						style={[
							styles.unavailableBadge,
							{ backgroundColor: c.warningTint },
						]}
					>
						<Ionicons name="time-outline" size={16} color={c.warningText} />
						<Text
							style={[styles.unavailableBadgeText, { color: c.warningText }]}
						>
							{t("boost.mobileUnavailableBadge")}
						</Text>
					</View>

					<Text style={[styles.unavailableTitle, { color: textColor }]}>
						{t("boost.mobileUnavailableTitle")}
					</Text>
					<Text style={[styles.unavailableText, { color: bodyColor }]}>
						{t("boost.mobileUnavailableMessage")}
					</Text>
					{listingId ? (
						<Text style={[styles.unavailableMeta, { color: mutedColor }]}>
							{t("boost.listingReference", { listingId })}
						</Text>
					) : null}
				</View>

				<Pressable
					onPress={() => router.dismiss()}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.closeAction,
						{ backgroundColor: filledColor, opacity: pressed ? 0.85 : 1 },
					]}
				>
					<Text style={styles.closeActionText}>{t("common.back")}</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	closeBtn: {
		alignSelf: "flex-end",
		width: 48,
		height: 48,
		marginRight: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	container: {
		flex: 1,
		justifyContent: "center",
		padding: 24,
	},
	header: {
		alignItems: "center",
		marginBottom: 24,
	},
	// The signage plaque of the sell tab, squared, ink on yellow.
	rocketIconWrap: {
		alignItems: "center",
		borderRadius: 18,
		height: 72,
		justifyContent: "center",
		marginBottom: 18,
		width: 72,
	},
	title: {
		fontFamily: Fonts.displayExtrabold,
		fontSize: 26,
		lineHeight: 31,
		letterSpacing: -0.6,
		marginBottom: 8,
		textAlign: "center",
	},
	subtitle: {
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 22,
		textAlign: "center",
	},
	unavailableCard: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		gap: 12,
		padding: 20,
	},
	unavailableBadge: {
		alignItems: "center",
		alignSelf: "flex-start",
		borderRadius: 8,
		flexDirection: "row",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	unavailableBadgeText: {
		fontFamily: Fonts.bodyBold,
		fontSize: 13,
	},
	unavailableTitle: {
		fontFamily: Fonts.displayBold,
		fontSize: 19,
		lineHeight: 24,
		letterSpacing: -0.3,
	},
	unavailableText: {
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 22,
	},
	unavailableMeta: {
		fontFamily: Fonts.body,
		fontSize: 12,
		lineHeight: 16,
	},
	closeAction: {
		alignItems: "center",
		borderRadius: 12,
		justifyContent: "center",
		marginTop: 20,
		minHeight: 52,
	},
	closeActionText: {
		color: "#ffffff",
		fontFamily: Fonts.bodyBold,
		fontSize: 16,
	},
});
