import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

type IoniconsName = keyof typeof Ionicons.glyphMap;

export default function SafetyScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";

	const TIPS: Array<{ icon: IoniconsName; title: string; desc: string }> = [
		{
			icon: "storefront-outline",
			title: t("safety.tip1Title"),
			desc: t("safety.tip1Desc"),
		},
		{
			icon: "eye-outline",
			title: t("safety.tip2Title"),
			desc: t("safety.tip2Desc"),
		},
		{
			icon: "cash-outline",
			title: t("safety.tip3Title"),
			desc: t("safety.tip3Desc"),
		},
		{
			icon: "people-outline",
			title: t("safety.tip4Title"),
			desc: t("safety.tip4Desc"),
		},
		{
			icon: "person-circle-outline",
			title: t("safety.tip5Title"),
			desc: t("safety.tip5Desc"),
		},
		{
			icon: "flag-outline",
			title: t("safety.tip6Title"),
			desc: t("safety.tip6Desc"),
		},
	];

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.title, { color: textColor }]}>
					{t("safety.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
				{/* Hero icon */}
				<View
					style={[
						styles.heroWrap,
						{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9", borderColor },
					]}
				>
					<Ionicons
						name="shield-checkmark-outline"
						size={48}
						color={primaryColor}
					/>
				</View>
				<Text style={[styles.heading, { color: textColor }]}>
					{t("safety.heading")}
				</Text>
				<Text style={[styles.subtitle, { color: mutedColor }]}>
					{t("safety.subtitle")}
				</Text>

				{TIPS.map((tip, i) => (
					<View
						key={i}
						style={[styles.tipCard, { backgroundColor: cardBg, borderColor }]}
					>
						<View
							style={[
								styles.tipIconWrap,
								{ backgroundColor: isDark ? "#0b1120" : "#f8fafc" },
							]}
						>
							<Ionicons name={tip.icon} size={22} color={primaryColor} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.tipTitle, { color: textColor }]}>
								{tip.title}
							</Text>
							<Text style={[styles.tipDesc, { color: mutedColor }]}>
								{tip.desc}
							</Text>
						</View>
					</View>
				))}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	title: { fontSize: 17, fontFamily: Fonts.displayBold },
	scroll: { padding: 20, gap: 12, paddingBottom: 40 },
	heroWrap: {
		width: 80,
		height: 80,
		borderRadius: 40,
		alignSelf: "center",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 12,
		borderWidth: 1,
	},
	heading: {
		fontSize: 20,
		fontFamily: Fonts.displayExtrabold,
		textAlign: "center",
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 20,
		marginBottom: 8,
	},
	tipCard: {
		flexDirection: "row",
		gap: 14,
		borderRadius: 12,
		borderWidth: 1,
		padding: 14,
		alignItems: "flex-start",
	},
	tipIconWrap: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	tipTitle: { fontSize: 15, fontFamily: Fonts.displayBold, marginBottom: 4 },
	tipDesc: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.body },
});
