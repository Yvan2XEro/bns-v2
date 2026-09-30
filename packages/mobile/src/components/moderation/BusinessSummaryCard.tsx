import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { ModerationVerificationDetail } from "@/src/types/api";
import { useModerationTheme } from "./theme";

type Business = NonNullable<
	ModerationVerificationDetail["request"]["business"]
>;
type ReviewSignals = ModerationVerificationDetail["request"]["reviewSignals"];

function Row({ label, value }: { label: string; value: string | null }) {
	const c = useModerationTheme();
	return (
		<View style={styles.row}>
			<Text style={[styles.label, { color: c.muted }]}>{label}</Text>
			<Text style={[styles.value, { color: c.text }]} numberOfLines={2}>
				{value ?? "—"}
			</Text>
		</View>
	);
}

/** The seller's registry details, level 3 only. */
export function BusinessSummaryCard({
	business,
	signals,
}: {
	business: Business | null | undefined;
	signals: ReviewSignals;
}) {
	const c = useModerationTheme();
	const { t } = useTranslation();

	if (!business) return null;

	const niuFlagged = signals.some((signal) => signal.code === "niu_format");

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>
				{t("moderation.verifBusinessTitle")}
			</Text>
			<Row
				label={t("moderation.verifBusinessType")}
				value={
					business.businessType
						? t(`moderation.verifBusinessType_${business.businessType}`)
						: null
				}
			/>
			<Row
				label={t("moderation.verifBusinessLegalName")}
				value={business.legalName}
			/>
			<Row
				label={t("moderation.verifBusinessTradeName")}
				value={business.tradeName}
			/>
			<Row
				label={t("moderation.verifBusinessRccm")}
				value={business.rccmNumber}
			/>
			<Row
				label={t("moderation.verifBusinessEntreprenantNumber")}
				value={business.entreprenantDeclarationNumber}
			/>
			<View style={styles.row}>
				<Text style={[styles.label, { color: c.muted }]}>
					{t("moderation.verifBusinessNiu")}
				</Text>
				<View style={styles.niuValue}>
					<Text style={[styles.value, { color: c.text }]}>
						{business.niu ?? "—"}
					</Text>
					{niuFlagged ? (
						<View
							style={[styles.warningPill, { backgroundColor: c.warningSoft }]}
						>
							<Ionicons name="alert-circle" size={12} color={c.warning} />
							<Text style={[styles.warningText, { color: c.warning }]}>
								{t("moderation.verifBusinessNiuFormatWarning")}
							</Text>
						</View>
					) : null}
				</View>
			</View>
			<Row
				label={t("moderation.verifBusinessAddress")}
				value={business.registeredAddress}
			/>
			<Row label={t("moderation.verifBusinessCity")} value={business.city} />
			<Row
				label={t("moderation.verifBusinessRepresentative")}
				value={business.legalRepresentativeName}
			/>
			<Row
				label={t("moderation.verifBusinessRepresentativeIsOwner")}
				value={t(
					business.legalRepresentativeIsOwner
						? "moderation.verifCommonYes"
						: "moderation.verifCommonNo",
				)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 8,
	},
	title: { fontSize: 15, fontFamily: Fonts.displayBold, marginBottom: 2 },
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
	},
	label: { fontSize: 13, fontFamily: Fonts.body },
	value: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
		textAlign: "right",
	},
	niuValue: { flexShrink: 1, alignItems: "flex-end", gap: 4 },
	warningPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	warningText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
});
