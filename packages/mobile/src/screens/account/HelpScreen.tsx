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
/** The answers that name a place in the app, and the way there. */
const FAQ_LINKS: Record<
	number,
	{
		labelKey: string;
		fallback: string;
		href: "/security" | "/account/listings";
	}
> = {
	3: {
		labelKey: "help.openMyListings",
		fallback: "Ouvrir Mes annonces",
		href: "/account/listings",
	},
	6: {
		labelKey: "help.openSecurity",
		fallback: "Ouvrir Sécurité",
		href: "/security",
	},
};

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
							<View key={faq.q}>
								<Pressable
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
										<Text style={[styles.faqA, { color: c.body }]}>
											{faq.a}
										</Text>
									) : null}
								</Pressable>
								{/* A sibling of the question, not inside it, so a screen
								    reader reaches it as its own link. */}
								{open && FAQ_LINKS[i] ? (
									<Pressable
										onPress={() => router.push(FAQ_LINKS[i].href)}
										accessibilityRole="link"
										hitSlop={8}
										style={styles.faqLink}
									>
										<Text style={[styles.faqLinkText, { color: c.link }]}>
											{t(FAQ_LINKS[i].labelKey, {
												defaultValue: FAQ_LINKS[i].fallback,
											})}
										</Text>
										<Ionicons name="chevron-forward" size={16} color={c.link} />
									</Pressable>
								) : null}
							</View>
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
	faqLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: 44,
		marginTop: -6,
		marginBottom: 4,
		paddingHorizontal: 16,
		alignSelf: "flex-start",
	},
	faqLinkText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	faqA: {
		fontSize: 15,
		lineHeight: 23,
		marginTop: 8,
		fontFamily: Fonts.body,
		maxWidth: 600,
	},
});
