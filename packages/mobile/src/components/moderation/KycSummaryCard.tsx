import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import type { ModerationVerificationDetail } from "@/src/types/api";
import { useModerationTheme } from "./theme";

type Kyc = NonNullable<ModerationVerificationDetail["request"]["kyc"]>;

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

/** The seller's identity-check outcome, level 2 only. Never the document bytes — those live in `DocumentList`. */
export function KycSummaryCard({ kyc }: { kyc: Kyc | null | undefined }) {
	const c = useModerationTheme();
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en-US" : "fr-FR";

	if (!kyc) return null;

	const expiresOn = formatDate(kyc.documentExpiresAt, undefined, locale);
	const fullName = [kyc.givenNames, kyc.familyName].filter(Boolean).join(" ");

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>
				{t("moderation.verifKycTitle")}
			</Text>
			<Row
				label={t("moderation.verifKycOutcome")}
				value={t(`moderation.verifKycStatus_${kyc.status ?? "not_started"}`)}
			/>
			<Row
				label={t("moderation.verifKycDocument")}
				value={
					kyc.documentType
						? `${t(`moderation.verifDocumentType_${kyc.documentType}`)} · ${kyc.documentCountry ?? "—"}`
						: null
				}
			/>
			<Row
				label={t("moderation.verifKycLast4")}
				value={kyc.documentNumberLast4}
			/>
			<Row label={t("moderation.verifKycExpiry")} value={expiresOn} />
			<Row label={t("moderation.verifKycName")} value={fullName || null} />
			<Row
				label={t("moderation.verifKycLiveness")}
				value={
					kyc.livenessPassed === null || kyc.livenessPassed === undefined
						? null
						: t(
								kyc.livenessPassed
									? "moderation.verifCommonPassed"
									: "moderation.verifCommonFailed",
							)
				}
			/>
			<Row
				label={t("moderation.verifKycFaceMatch")}
				value={
					typeof kyc.faceMatchScore === "number"
						? `${Math.round(kyc.faceMatchScore * 100)}%`
						: null
				}
			/>
			{kyc.vendorReviewUrl ? (
				<Pressable
					accessibilityRole="link"
					accessibilityLabel={t("moderation.verifKycVendorConsole")}
					onPress={() => Linking.openURL(kyc.vendorReviewUrl as string)}
					style={styles.vendorLink}
					hitSlop={8}
				>
					<Text style={[styles.link, { color: c.primary }]}>
						{t("moderation.verifKycVendorConsole")}
					</Text>
					<Ionicons name="open-outline" size={14} color={c.primary} />
				</Pressable>
			) : null}
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
	vendorLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: 44,
	},
	link: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
