import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

const FAQ_COUNT = 7;

export default function HelpScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState<number | null>(null);

	const FAQS = Array.from({ length: FAQ_COUNT }, (_, i) => ({
		q: t(`help.q${i + 1}` as any),
		a: t(`help.a${i + 1}` as any),
	}));

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
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
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
						{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9", borderColor },
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
							backgroundColor: isDark ? "#1e3a5f" : "#dbeafe",
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
