import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

const FAQ_COUNT = 7;

export function HelpScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState<number | null>(null);

	const FAQS = Array.from({ length: FAQ_COUNT }, (_, i) => ({
		q: t(`help.q${i + 1}` as any),
		a: t(`help.a${i + 1}` as any),
	}));

	const bg = isDark ? "#0c1030" : "#f4f5f9";
	const cardBg = isDark ? "#1a1f4a" : "#ffffff";
	const textColor = isDark ? "#e1e3ee" : "#12163a";
	const mutedColor = isDark ? "#a3a7c8" : "#5b6088";
	const primaryColor = isDark ? "#6878ea" : "#23338f";
	const borderColor = isDark ? "#2a3170" : "#e1e3ee";

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<HeaderBackButton
					color={textColor}
					fallback="/(tabs)/account"
					style={styles.backBtn}
				/>
				<Text style={[styles.title, { color: textColor }]}>
					{t("help.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
				{/* Hero icon */}
				<View
					style={[
						styles.heroWrap,
						{ backgroundColor: isDark ? "#1a1f4a" : "#eceef5", borderColor },
					]}
				>
					<Ionicons name="help-circle-outline" size={48} color={primaryColor} />
				</View>
				<Text style={[styles.heading, { color: textColor }]}>
					{t("help.frequentQuestions")}
				</Text>

				{FAQS.map((faq, i) => (
					<Pressable
						key={i}
						onPress={() => setExpanded(expanded === i ? null : i)}
						style={[styles.faqItem, { backgroundColor: cardBg, borderColor }]}
					>
						<View style={styles.faqHeader}>
							<Text style={[styles.faqQ, { color: textColor }]}>{faq.q}</Text>
							<Ionicons
								name={expanded === i ? "chevron-up" : "chevron-down"}
								size={18}
								color={mutedColor}
							/>
						</View>
						{expanded === i && (
							<Text style={[styles.faqA, { color: mutedColor }]}>{faq.a}</Text>
						)}
					</Pressable>
				))}

				<Pressable
					onPress={() => router.push("/contact")}
					style={[
						styles.contactBtn,
						{
							backgroundColor: isDark ? "#2a3170" : "#e3e7f8",
							borderColor: primaryColor,
						},
					]}
				>
					<Ionicons
						name="chatbubble-ellipses-outline"
						size={18}
						color={primaryColor}
					/>
					<Text style={[styles.contactText, { color: primaryColor }]}>
						{t("help.contactSupport")}
					</Text>
				</Pressable>
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
	backBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	title: { fontSize: 17, fontFamily: Fonts.displayBold },
	scroll: { padding: 20, gap: 10, paddingBottom: 40 },
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
		marginBottom: 8,
	},
	faqItem: { borderRadius: 12, borderWidth: 1, padding: 14 },
	faqHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 10,
	},
	faqQ: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		lineHeight: 20,
	},
	faqA: { fontSize: 13, lineHeight: 20, marginTop: 10, fontFamily: Fonts.body },
	contactBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingVertical: 14,
		marginTop: 8,
	},
	contactText: { fontSize: 15, fontFamily: Fonts.displayBold },
});
