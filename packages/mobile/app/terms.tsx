import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

// Content lives in src/locales/{en,fr}.json under `terms.sections.*` so the terms
// exist in both app languages. Order here is the order on screen, and it must
// stay in sync with the keys declared in the locale files.
const SECTION_KEYS = [
	"acceptance",
	"service",
	"eligibility",
	"prohibited",
	"responsibility",
	"moderation",
	"intellectualProperty",
	"dataProtection",
	"suspension",
	"changes",
] as const;

export default function TermsScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const _cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

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
					{t("terms.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
				<Text style={[styles.updated, { color: mutedColor }]}>
					{t("terms.lastUpdated")}
				</Text>

				{SECTION_KEYS.map((key) => (
					<View key={key} style={styles.section}>
						<Text style={[styles.sectionTitle, { color: textColor }]}>
							{t(`terms.sections.${key}.title`)}
						</Text>
						<Text style={[styles.paragraph, { color: mutedColor }]}>
							{t(`terms.sections.${key}.body`)}
						</Text>
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
	title: { fontSize: 17, fontWeight: "700" },
	scroll: { padding: 20, paddingBottom: 40 },
	updated: { fontSize: 12, marginBottom: 20, textAlign: "center" },
	section: { marginBottom: 20 },
	sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
	paragraph: { fontSize: 14, lineHeight: 22 },
});
