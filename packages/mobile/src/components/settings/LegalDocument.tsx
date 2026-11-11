import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useGroupedColors } from "./Grouped";
import { SettingsHeader } from "./SettingsHeader";

/**
 * A long text to read (terms, privacy): the title in the bar, the date it
 * last changed, then its sections at a reading measure — headings in
 * Outfit with more room above than below, running text in DM Sans at 16.
 */
export function LegalDocument({
	title,
	updated,
	sections,
}: {
	title: string;
	updated: string;
	sections: { key: string; title: string; body: string }[];
}) {
	const c = useGroupedColors();
	const { centeredContent } = useResponsive();
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={title} />
			<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
				<View style={styles.measure}>
					<Text style={[styles.updated, { color: c.mutedForeground }]}>
						{updated}
					</Text>
					{sections.map((section) => (
						<View key={section.key} style={styles.section}>
							<Text
								accessibilityRole="header"
								style={[styles.sectionTitle, { color: c.foreground }]}
							>
								{section.title}
							</Text>
							<Text selectable style={[styles.paragraph, { color: c.body }]}>
								{section.body}
							</Text>
						</View>
					))}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 56 },
	// About 70 characters a line at 16pt: the measure for a long read.
	measure: { width: "100%", maxWidth: 600, alignSelf: "center" },
	updated: {
		fontFamily: Fonts.body,
		fontSize: 13,
		lineHeight: 18,
	},
	section: { marginTop: 28, gap: 8 },
	sectionTitle: {
		fontFamily: Fonts.displayBold,
		fontSize: 18,
		lineHeight: 23,
		letterSpacing: -0.2,
	},
	paragraph: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 25 },
});
