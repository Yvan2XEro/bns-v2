import type { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import {
	GroupedRow,
	GroupedSection,
	RowIcon,
	useGroupedColors,
} from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

type IoniconsName = keyof typeof Ionicons.glyphMap;

const TIP_ICONS: IoniconsName[] = [
	"storefront-outline",
	"eye-outline",
	"cash-outline",
	"people-outline",
	"person-circle-outline",
	"flag-outline",
];

/**
 * How to buy and sell safely: a short lead, then the six habits as one
 * list — each a drawn icon, the rule, and why.
 */
export function SafetyScreen() {
	const c = useGroupedColors();
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("safety.title")} />

			<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
				<View style={styles.lead}>
					<Text
						accessibilityRole="header"
						style={[styles.heading, { color: c.foreground }]}
					>
						{t("safety.heading")}
					</Text>
					<Text style={[styles.subtitle, { color: c.body }]}>
						{t("safety.subtitle")}
					</Text>
				</View>

				<GroupedSection inset={58}>
					{TIP_ICONS.map((icon, i) => (
						<View
							key={icon}
							style={styles.tip}
							accessible
							accessibilityLabel={`${t(`safety.tip${i + 1}Title`)}. ${t(
								`safety.tip${i + 1}Desc`,
							)}`}
						>
							<RowIcon name={icon} tone="brand" />
							<View style={styles.tipText}>
								<Text style={[styles.tipTitle, { color: c.foreground }]}>
									{t(`safety.tip${i + 1}Title`)}
								</Text>
								<Text style={[styles.tipDesc, { color: c.body }]}>
									{t(`safety.tip${i + 1}Desc`)}
								</Text>
							</View>
						</View>
					))}
				</GroupedSection>

				{/* Advice, then the way forward for someone it is already too
				    late for. */}
				<GroupedSection
					title={t("safety.actionsTitle", { defaultValue: "Un problème ?" })}
				>
					<GroupedRow
						icon="chatbubble-ellipses-outline"
						iconTone="brand"
						label={t("disputes.title")}
						detail={t("disputes.subtitle")}
						onPress={() => router.push("/account/disputes")}
					/>
					<GroupedRow
						icon="flag-outline"
						iconTone="danger"
						label={t("contact.subjectAbuse")}
						onPress={() =>
							router.push({
								pathname: "/contact",
								params: { subject: "subjectAbuse" },
							})
						}
					/>
				</GroupedSection>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	scroll: { padding: 16, paddingTop: 24, gap: 24, paddingBottom: 48 },
	lead: { gap: 8, paddingHorizontal: 4, maxWidth: 600 },
	heading: {
		fontSize: 24,
		lineHeight: 32,
		letterSpacing: -0.5,
		fontFamily: Fonts.displayBold,
	},
	subtitle: { fontSize: 16, lineHeight: 24, fontFamily: Fonts.body },
	tip: {
		flexDirection: "row",
		gap: 12,
		paddingHorizontal: 16,
		paddingVertical: 14,
		alignItems: "flex-start",
	},
	tipText: { flex: 1, gap: 3 },
	tipTitle: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.bodySemibold },
	tipDesc: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
});
