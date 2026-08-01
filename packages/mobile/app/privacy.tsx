import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

// Content lives in src/locales/{en,fr}.json under `privacy.sections.*` so the
// policy exists in both app languages. Order here is the order on screen, and it
// must stay in sync with the keys declared in the locale files.
const SECTION_KEYS = [
	"intro",
	"account",
	"phone",
	"social",
	"photos",
	"location",
	"content",
	"messaging",
	"push",
	"device",
	"noTracking",
	"visibility",
	"sharing",
	"deletion",
	"retention",
	"rights",
	"children",
	"security",
	"changes",
	"contact",
] as const;

export default function PrivacyScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();

	const bg = isDark ? "#0b1120" : "#f8fafc";
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
					{t("privacy.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
				<Text style={[styles.updated, { color: mutedColor }]}>
					{t("privacy.lastUpdated")}
				</Text>

				{SECTION_KEYS.map((key) => (
					<View key={key} style={styles.section}>
						<Text style={[styles.sectionTitle, { color: textColor }]}>
							{t(`privacy.sections.${key}.title`)}
						</Text>
						<Text style={[styles.paragraph, { color: mutedColor }]}>
							{t(`privacy.sections.${key}.body`)}
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
	title: { fontSize: 15, fontWeight: "700" },
	scroll: { padding: 20, paddingBottom: 40 },
	updated: { fontSize: 12, marginBottom: 20, textAlign: "center" },
	section: { marginBottom: 20 },
	sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
	paragraph: { fontSize: 14, lineHeight: 22 },
});
