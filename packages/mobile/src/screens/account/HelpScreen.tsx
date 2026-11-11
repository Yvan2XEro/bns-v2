import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import {
	GroupedRow,
	GroupedSection,
	useGroupedColors,
} from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

const FAQ_COUNT = 7;

/**
 * The questions people ask, as one list that opens in place — one answer
 * at a time — and the way to a person under it.
 */
export function HelpScreen() {
	const c = useGroupedColors();
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState<number | null>(null);

	const FAQS = Array.from({ length: FAQ_COUNT }, (_, i) => ({
		q: t(`help.q${i + 1}` as any),
		a: t(`help.a${i + 1}` as any),
	}));

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("help.title")} />

			<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
				<GroupedSection title={t("help.frequentQuestions")}>
					{FAQS.map((faq, i) => {
						const open = expanded === i;
						return (
							<Pressable
								key={faq.q}
								onPress={() => setExpanded(open ? null : i)}
								accessibilityRole="button"
								accessibilityLabel={faq.q}
								accessibilityState={{ expanded: open }}
								android_ripple={{ color: c.well }}
								style={({ pressed }) => [
									styles.faq,
									pressed ? { backgroundColor: c.well } : null,
								]}
							>
								<View style={styles.faqHeader}>
									<Text style={[styles.faqQ, { color: c.foreground }]}>
										{faq.q}
									</Text>
									<Ionicons
										name={open ? "chevron-up" : "chevron-down"}
										size={18}
										color={c.mutedForeground}
									/>
								</View>
								{open ? (
									<Text style={[styles.faqA, { color: c.body }]}>{faq.a}</Text>
								) : null}
							</Pressable>
						);
					})}
				</GroupedSection>

				<GroupedSection>
					<GroupedRow
						icon="chatbubble-ellipses-outline"
						iconTone="brand"
						label={t("help.contactSupport")}
						onPress={() => router.push("/contact")}
					/>
				</GroupedSection>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	scroll: { padding: 16, paddingTop: 20, gap: 24, paddingBottom: 48 },
	faq: { paddingHorizontal: 16, paddingVertical: 14, minHeight: 52 },
	faqHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 12,
	},
	faqQ: {
		flex: 1,
		fontSize: 16,
		fontFamily: Fonts.bodySemibold,
		lineHeight: 22,
	},
	faqA: {
		fontSize: 15,
		lineHeight: 23,
		marginTop: 8,
		fontFamily: Fonts.body,
		maxWidth: 600,
	},
});
