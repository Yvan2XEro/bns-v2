import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { requirementLabelKey } from "@/src/lib/verification";
import type { VerificationRequirement } from "../../../../api/src/contracts/verificationRequirements";

type Tone = "positive" | "progress" | "negative" | "pending";

const TONE: Record<VerificationRequirement["status"], Tone> = {
	missing: "pending",
	provided: "progress",
	in_review: "progress",
	approved: "positive",
	rejected: "negative",
};

const ICON: Record<Tone, keyof typeof Ionicons.glyphMap> = {
	positive: "checkmark-circle",
	progress: "time-outline",
	negative: "close-circle",
	pending: "document-text-outline",
};

/** The list comes from the API (`nextLevel.requirements`), never from a table kept here. */
export function RequirementList({
	requirements,
}: {
	requirements: VerificationRequirement[];
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	if (requirements.length === 0) return null;

	const palette: Record<Tone, { fg: string; bg: string }> = {
		positive: { fg: c.successText, bg: c.successSoft },
		progress: { fg: c.primary, bg: c.primarySoft },
		negative: { fg: c.dangerText, bg: c.dangerSoft },
		pending: { fg: c.neutralText, bg: c.neutralSoft },
	};

	return (
		<View style={styles.wrap}>
			<Text style={[styles.title, { color: c.muted }]}>
				{t("verification.requirements.title")}
			</Text>
			<View accessibilityRole="list" style={styles.list}>
				{requirements.map((item) => {
					const tone = TONE[item.status];
					const label = t(requirementLabelKey(item.key));
					const status = t(`verification.requirements.status.${item.status}`);
					return (
						<View
							key={item.key}
							accessible
							accessibilityLabel={`${label}, ${status}`}
							style={styles.row}
						>
							<Ionicons name={ICON[tone]} size={16} color={palette[tone].fg} />
							<Text style={[styles.label, { color: c.body }]}>{label}</Text>
							<View
								style={[styles.pill, { backgroundColor: palette[tone].bg }]}
							>
								<Text style={[styles.pillText, { color: palette[tone].fg }]}>
									{status}
								</Text>
							</View>
						</View>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { marginTop: 10, gap: 8 },
	title: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	list: { gap: 8 },
	row: { flexDirection: "row", alignItems: "center", gap: 8 },
	label: { flex: 1, fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
	pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
	pillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
});
