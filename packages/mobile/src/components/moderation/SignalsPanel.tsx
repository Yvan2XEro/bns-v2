import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { signalToneKey } from "@/src/lib/moderationVerification";
import { statusToneKey } from "@/src/lib/verification";
import type {
	ModerationVerificationDetail,
	ReviewSignalCode,
} from "@/src/types/api";
import { ModerationCard } from "./ModerationKit";
import { type ModerationPalette, useModerationTheme } from "./theme";
import { toneColors, tonesOf } from "./tones";

type ReviewSignal =
	ModerationVerificationDetail["request"]["reviewSignals"][number];
type OtherRequest = ModerationVerificationDetail["otherRequests"][number];

/** One review signal, coloured by `signalToneKey`. Reused by the queue row and this panel. */
export function SignalChip({ code }: { code: ReviewSignalCode | string }) {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const tone = toneColors(signalToneKey(code), c);
	const key = `moderation.verifSignal_${code}`;
	const translated = t(key);
	const label = translated === key ? code : translated;

	return (
		<View style={[styles.chip, { backgroundColor: tone.soft }]}>
			<Text style={[styles.chipText, { color: tone.text }]}>{label}</Text>
		</View>
	);
}

/** Signals raised against this request, and the shop's other requests they (or the reviewer) may need to cross-check. */
export function SignalsPanel({
	signals,
	otherRequests,
}: {
	signals: ReviewSignal[];
	otherRequests: OtherRequest[];
}) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();

	if (signals.length === 0 && otherRequests.length === 0) return null;

	return (
		<ModerationCard title={t("moderation.verifSignalsTitle")}>
			{signals.length > 0 ? (
				<View style={styles.signals}>
					{signals.map((signal, index) => (
						<View key={`${signal.code}-${index}`} style={styles.signalRow}>
							<SignalChip code={signal.code} />
							{signal.detail ? (
								<Text style={[styles.detail, { color: c.text }]}>
									{signal.detail}
								</Text>
							) : null}
							{signal.relatedRequest ? (
								<Pressable
									accessibilityRole="link"
									accessibilityLabel={t("moderation.verifSignalsViewRelated")}
									onPress={() =>
										router.push(
											`/moderation/verification/${signal.relatedRequest}` as never,
										)
									}
									style={styles.inlineLink}
								>
									<Text style={[styles.link, { color: k.linkText }]}>
										{t("moderation.verifSignalsViewRelated")}
									</Text>
									<Ionicons
										name="chevron-forward"
										size={14}
										color={k.linkText}
									/>
								</Pressable>
							) : null}
						</View>
					))}
				</View>
			) : null}

			{otherRequests.length > 0 ? (
				<View style={[styles.otherRequests, { borderTopColor: c.border }]}>
					<Text
						accessibilityRole="header"
						style={[styles.subheading, { color: c.text }]}
					>
						{t("moderation.verifSignalsOtherRequests")}
					</Text>
					{otherRequests.map((request) => (
						<OtherRequestRow key={request.id} request={request} c={c} />
					))}
				</View>
			) : null}
		</ModerationCard>
	);
}

function OtherRequestRow({
	request,
	c,
}: {
	request: OtherRequest;
	c: ModerationPalette;
}) {
	const { t } = useTranslation();
	const k = tonesOf(c);
	const tone = toneColors(statusToneKey(request.status), c);
	const label = t("moderation.verifLevelRequest", {
		level: request.requestedLevel,
	});
	const status = t(`moderation.verifStatus_${request.status}`);

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${label}, ${status}`}
			onPress={() =>
				router.push(`/moderation/verification/${request.id}` as never)
			}
			style={({ pressed }) => [styles.otherRow, { opacity: pressed ? 0.7 : 1 }]}
		>
			<Text style={[styles.link, styles.flex, { color: k.linkText }]}>
				{label}
			</Text>
			<View style={[styles.chip, { backgroundColor: tone.soft }]}>
				<Text style={[styles.chipText, { color: tone.text }]}>{status}</Text>
			</View>
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	signals: { gap: 10 },
	signalRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	detail: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.body,
		flexShrink: 1,
	},
	inlineLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		minHeight: 48,
	},
	link: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	chip: {
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	chipText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
	otherRequests: {
		gap: 4,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 12,
	},
	subheading: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	otherRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: 48,
	},
});
