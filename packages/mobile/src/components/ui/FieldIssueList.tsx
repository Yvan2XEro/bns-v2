import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { type FieldIssue, issueMessage } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import type { ListingAttribute } from "@/src/lib/listingForm";

const LABEL_KEYS: Record<string, string> = {
	title: "create.titleFieldLabel",
	description: "create.descriptionFieldLabel",
	category: "create.categoryFieldLabel",
	price: "create.priceFieldLabel",
	location: "create.locationRowLabel",
	images: "create.photosRowLabel",
	tags: "create.tagsFieldLabel",
};

/**
 * The fields to fix on a listing form, each named the way the form labels it
 * — for the long screens where the refused field may be off-screen.
 */
export function FieldIssueList({
	issues,
	attributes,
}: {
	issues: FieldIssue[];
	attributes: ListingAttribute[];
}) {
	const { t } = useTranslation();
	const C = Colors[useColorScheme() === "dark" ? "dark" : "light"];
	if (issues.length === 0) return null;

	const labelOf = (path: string) => {
		if (path.startsWith("attributes.")) {
			const slug = path.slice("attributes.".length);
			return attributes.find((a) => a.slug === slug)?.name ?? slug;
		}
		const key = LABEL_KEYS[path.split(".")[0]];
		return key ? t(key) : path;
	};

	return (
		<View
			style={[
				styles.box,
				{ backgroundColor: C.dangerTint, borderColor: C.destructive },
			]}
			accessibilityRole="alert"
		>
			{issues.map((issue) => (
				<View key={`${issue.path}:${issue.rule}`} style={styles.row}>
					<Ionicons name="alert-circle" size={14} color={C.dangerText} />
					<Text style={[styles.text, { color: C.dangerText }]}>
						<Text style={styles.label}>{labelOf(issue.path)} — </Text>
						{issueMessage(t, issue)}
					</Text>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	box: {
		gap: 6,
		padding: 12,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		marginVertical: 8,
	},
	row: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
	text: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	label: { fontFamily: Fonts.bodySemibold },
});
