import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
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

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<Pressable onPress={() => router.dismiss()} style={styles.closeBtn}>
				<Ionicons name="close" size={24} color={textColor} />
			</Pressable>

			<View style={[styles.container, centeredContent]}>
				<View style={styles.header}>
					<View style={styles.rocketIconWrap}>
						<Ionicons name="rocket-outline" size={44} color="#f59e0b" />
					</View>
					<Text style={[styles.title, { color: textColor }]}>
						{t("boost.boostTitle")}
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
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
							{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
						]}
					>
						<Ionicons
							name="information-circle-outline"
							size={18}
							color={primaryColor}
						/>
						<Text
							style={[styles.unavailableBadgeText, { color: primaryColor }]}
						>
							{t("boost.mobileUnavailableBadge")}
						</Text>
					</View>

					<Text style={[styles.unavailableTitle, { color: textColor }]}>
						{t("boost.mobileUnavailableTitle")}
					</Text>
					<Text style={[styles.unavailableText, { color: mutedColor }]}>
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
					style={[styles.closeAction, { backgroundColor: primaryColor }]}
				>
					<Text style={styles.closeActionText}>{t("common.back")}</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	closeBtn: { alignSelf: "flex-end", padding: 16 },
	container: {
		flex: 1,
		justifyContent: "center",
		padding: 24,
	},
	header: {
		alignItems: "center",
		marginBottom: 24,
	},
	rocketIconWrap: {
		alignItems: "center",
		backgroundColor: "rgba(245,158,11,0.12)",
		borderRadius: 40,
		height: 80,
		justifyContent: "center",
		marginBottom: 16,
		width: 80,
	},
	title: {
		fontFamily: Fonts.displayExtrabold,
		fontSize: 24,
		marginBottom: 8,
		textAlign: "center",
	},
	subtitle: {
		fontFamily: Fonts.body,
		fontSize: 14,
		lineHeight: 20,
		textAlign: "center",
	},
	unavailableCard: {
		borderRadius: 24,
		borderWidth: 1,
		gap: 14,
		paddingHorizontal: 20,
		paddingVertical: 22,
	},
	unavailableBadge: {
		alignItems: "center",
		alignSelf: "flex-start",
		borderRadius: 999,
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	unavailableBadgeText: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 12,
	},
	unavailableTitle: {
		fontFamily: Fonts.bodyBold,
		fontSize: 20,
	},
	unavailableText: {
		fontFamily: Fonts.body,
		fontSize: 14,
		lineHeight: 22,
	},
	unavailableHint: {
		fontFamily: Fonts.body,
		fontSize: 13,
		lineHeight: 20,
	},
	unavailableMeta: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 12,
	},
	browserAction: {
		alignItems: "center",
		borderRadius: 16,
		borderWidth: 1,
		flexDirection: "row",
		gap: 10,
		justifyContent: "center",
		marginTop: 16,
		paddingVertical: 15,
	},
	browserActionText: {
		fontFamily: Fonts.bodyBold,
		fontSize: 15,
	},
	closeAction: {
		alignItems: "center",
		borderRadius: 16,
		justifyContent: "center",
		marginTop: 18,
		paddingVertical: 16,
	},
	closeActionText: {
		color: "#fff",
		fontFamily: Fonts.bodyBold,
		fontSize: 16,
	},
});
