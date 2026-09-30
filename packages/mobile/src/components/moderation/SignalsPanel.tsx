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
import { type ModerationPalette, useModerationTheme } from "./theme";

type ReviewSignal =
	ModerationVerificationDetail["request"]["reviewSignals"][number];
type OtherRequest = ModerationVerificationDetail["otherRequests"][number];

const TONE_COLOR_KEY = {
	positive: "success",
	negative: "danger",
	warning: "warning",
	neutral: "muted",
} as const;

const TONE_SOFT_KEY = {
	positive: "successSoft",
	negative: "dangerSoft",
	warning: "warningSoft",
	neutral: "border",
} as const;

/** One review signal, coloured by `signalToneKey`. Reused by the queue row and this panel. */
export function SignalChip({ code }: { code: ReviewSignalCode | string }) {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const tone = signalToneKey(code);
	const key = `moderation.verifSignal_${code}`;
	const translated = t(key);
	const label = translated === key ? code : translated;

	return (
		<View style={[styles.chip, { backgroundColor: c[TONE_SOFT_KEY[tone]] }]}>
			<Text style={[styles.chipText, { color: c[TONE_COLOR_KEY[tone]] }]}>
				{label}
			</Text>
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
	const { t } = useTranslation();

	if (signals.length === 0 && otherRequests.length === 0) return null;

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>
				{t("moderation.verifSignalsTitle")}
			</Text>

			{signals.length > 0 ? (
				<View style={{ gap: 8 }}>
					{signals.map((signal, index) => (
						<View key={`${signal.code}-${index}`} style={styles.signalRow}>
							<SignalChip code={signal.code} />
							{signal.detail ? (
								<Text style={[styles.detail, { color: c.muted }]}>
									{signal.detail}
								</Text>
							) : null}
							{signal.relatedRequest ? (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={t("moderation.verifSignalsViewRelated")}
									onPress={() =>
										router.push(
											`/moderation/verification/${signal.relatedRequest}` as never,
										)
									}
									hitSlop={8}
								>
									<Text style={[styles.link, { color: c.primary }]}>
										{t("moderation.verifSignalsViewRelated")}
									</Text>
								</Pressable>
							) : null}
						</View>
					))}
				</View>
			) : null}

			{otherRequests.length > 0 ? (
				<View style={[styles.otherRequests, { borderTopColor: c.border }]}>
					<Text style={[styles.subheading, { color: c.muted }]}>
						{t("moderation.verifSignalsOtherRequests")}
					</Text>
					{otherRequests.map((request) => (
						<OtherRequestRow key={request.id} request={request} c={c} />
					))}
				</View>
			) : null}
		</View>
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
	const tone = statusToneKey(request.status);

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t("moderation.verifLevelRequest", {
				level: request.requestedLevel,
			})}
			onPress={() =>
				router.push(`/moderation/verification/${request.id}` as never)
			}
			style={styles.otherRow}
		>
			<Text style={[styles.link, { color: c.primary }]}>
				{t("moderation.verifLevelRequest", { level: request.requestedLevel })}
			</Text>
			<Text style={[styles.status, { color: c[TONE_COLOR_KEY[tone]] }]}>
				{t(`moderation.verifStatus_${request.status}`)}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 10,
	},
	title: { fontSize: 15, fontFamily: Fonts.displayBold },
	signalRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	detail: { fontSize: 12, fontFamily: Fonts.body, flexShrink: 1 },
	link: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	chip: {
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	chipText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	otherRequests: {
		gap: 6,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 10,
	},
	subheading: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	otherRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 44,
	},
	status: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
