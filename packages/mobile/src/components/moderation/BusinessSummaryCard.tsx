import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { ModerationVerificationDetail } from "@/src/types/api";
import { CardDivider, FactRow, ModerationCard } from "./ModerationKit";
import { useModerationTheme } from "./theme";
import { tonesOf } from "./tones";

type Business = NonNullable<
	ModerationVerificationDetail["request"]["business"]
>;
type ReviewSignals = ModerationVerificationDetail["request"]["reviewSignals"];

/** The seller's registry details, level 3 only. */
export function BusinessSummaryCard({
	business,
	signals,
}: {
	business: Business | null | undefined;
	signals: ReviewSignals;
}) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();

	if (!business) return null;

	const niuFlagged = signals.some((signal) => signal.code === "niu_format");

	return (
		// Four groups, in the order a registry extract is checked: who the
		// business is, its numbers, where it sits, who answers for it.
		<ModerationCard title={t("moderation.verifBusinessTitle")}>
			<FactRow
				label={t("moderation.verifBusinessType")}
				value={
					business.businessType
						? t(`moderation.verifBusinessType_${business.businessType}`)
						: null
				}
			/>
			<FactRow
				label={t("moderation.verifBusinessLegalName")}
				value={business.legalName}
			/>
			<FactRow
				label={t("moderation.verifBusinessTradeName")}
				value={business.tradeName}
			/>
			<CardDivider />
			<FactRow
				label={t("moderation.verifBusinessRccm")}
				value={business.rccmNumber}
			/>
			<FactRow
				label={t("moderation.verifBusinessEntreprenantNumber")}
				value={business.entreprenantDeclarationNumber}
			/>
			<View style={styles.niuRow}>
				<FactRow
					label={t("moderation.verifBusinessNiu")}
					value={business.niu}
				/>
				{niuFlagged ? (
					<View
						style={[styles.warningPill, { backgroundColor: c.warningSoft }]}
					>
						<Ionicons name="alert-circle" size={14} color={k.warningText} />
						<Text style={[styles.warningText, { color: k.warningText }]}>
							{t("moderation.verifBusinessNiuFormatWarning")}
						</Text>
					</View>
				) : null}
			</View>
			<CardDivider />
			<FactRow
				label={t("moderation.verifBusinessAddress")}
				value={business.registeredAddress}
			/>
			<FactRow
				label={t("moderation.verifBusinessCity")}
				value={business.city}
			/>
			<CardDivider />
			<FactRow
				label={t("moderation.verifBusinessRepresentative")}
				value={business.legalRepresentativeName}
			/>
			<FactRow
				label={t("moderation.verifBusinessRepresentativeIsOwner")}
				value={t(
					business.legalRepresentativeIsOwner
						? "moderation.verifCommonYes"
						: "moderation.verifCommonNo",
				)}
			/>
		</ModerationCard>
	);
}

const styles = StyleSheet.create({
	niuRow: { gap: 6 },
	warningPill: {
		alignSelf: "flex-end",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
	warningText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
});
