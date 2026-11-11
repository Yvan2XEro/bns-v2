import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import type { ModerationVerificationDetail } from "@/src/types/api";
import { CardDivider, FactRow, ModerationCard } from "./ModerationKit";
import { useModerationTheme } from "./theme";
import { tonesOf } from "./tones";

type Kyc = NonNullable<ModerationVerificationDetail["request"]["kyc"]>;

/** The seller's identity-check outcome, level 2 only. Never the document bytes — those live in `DocumentList`. */
export function KycSummaryCard({ kyc }: { kyc: Kyc | null | undefined }) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en-US" : "fr-FR";

	if (!kyc) return null;

	const expiresOn = formatDate(kyc.documentExpiresAt, undefined, locale);
	const fullName = [kyc.givenNames, kyc.familyName].filter(Boolean).join(" ");
	const liveness =
		kyc.livenessPassed === null || kyc.livenessPassed === undefined
			? null
			: kyc.livenessPassed;

	return (
		// The checks the vendor ran first (outcome, liveness, face match),
		// then what the document says, under a hairline.
		<ModerationCard title={t("moderation.verifKycTitle")}>
			<FactRow
				label={t("moderation.verifKycOutcome")}
				value={t(`moderation.verifKycStatus_${kyc.status ?? "not_started"}`)}
				valueColor={
					kyc.status === "approved"
						? k.successText
						: kyc.status === "declined"
							? k.dangerText
							: undefined
				}
			/>
			<FactRow
				label={t("moderation.verifKycLiveness")}
				value={
					liveness === null
						? null
						: t(
								liveness
									? "moderation.verifCommonPassed"
									: "moderation.verifCommonFailed",
							)
				}
				valueColor={
					liveness === null
						? undefined
						: liveness
							? k.successText
							: k.dangerText
				}
			/>
			<FactRow
				label={t("moderation.verifKycFaceMatch")}
				value={
					typeof kyc.faceMatchScore === "number"
						? `${Math.round(kyc.faceMatchScore * 100)}%`
						: null
				}
			/>
			<CardDivider />
			<FactRow label={t("moderation.verifKycName")} value={fullName || null} />
			<FactRow
				label={t("moderation.verifKycDocument")}
				value={
					kyc.documentType
						? `${t(`moderation.verifDocumentType_${kyc.documentType}`)} · ${kyc.documentCountry ?? "—"}`
						: null
				}
			/>
			<FactRow
				label={t("moderation.verifKycLast4")}
				value={kyc.documentNumberLast4}
			/>
			<FactRow label={t("moderation.verifKycExpiry")} value={expiresOn} />
			{kyc.vendorReviewUrl ? (
				<Pressable
					accessibilityRole="link"
					accessibilityLabel={t("moderation.verifKycVendorConsole")}
					onPress={() => Linking.openURL(kyc.vendorReviewUrl as string)}
					style={({ pressed }) => [
						styles.vendorLink,
						{ borderTopColor: c.border, opacity: pressed ? 0.7 : 1 },
					]}
				>
					<Text style={[styles.link, { color: k.linkText }]}>
						{t("moderation.verifKycVendorConsole")}
					</Text>
					<Ionicons name="open-outline" size={16} color={k.linkText} />
				</Pressable>
			) : null}
		</ModerationCard>
	);
}

const styles = StyleSheet.create({
	vendorLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 48,
		borderTopWidth: StyleSheet.hairlineWidth,
		marginTop: 2,
	},
	link: { fontSize: 15, fontFamily: Fonts.bodySemibold },
});
