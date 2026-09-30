import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import {
	buildTimeline,
	type CanOpenResult,
	canOpenRequest,
} from "@/src/lib/verification";
import type { ShopVerificationResponse } from "@/src/types/api";
import { RequestTimeline } from "./RequestTimeline";
import { ReviewerMessage } from "./ReviewerMessage";

/** Mirrors the local alias in `lib/apiError.ts`: the real `t` (more
 * parameters, optional options) is assignable to this narrower shape. */
type TFunction = (key: string, values?: Record<string, string>) => string;

function reasonLine(
	t: TFunction,
	locale: string,
	result: CanOpenResult,
): string {
	if (result.ok) return "";
	if (result.reason === "cooldown" || result.reason === "notRenewableYet") {
		const date =
			formatDate(
				result.until,
				{ day: "numeric", month: "long", year: "numeric" },
				locale,
			) ?? result.until;
		return t(`verification.action.reason.${result.reason}`, { date });
	}
	const key =
		result.reason === "disabled"
			? "apiErrors.verification.disabled"
			: result.reason === "notEligible"
				? "apiErrors.verification.levelNotEligible"
				: "apiErrors.verification.requestOpen";
	return t(key);
}

/**
 * One level's request: its timeline, the reviewer's message, a "continue"
 * link while the request is still open to fill in, and the primary
 * start/renew action `canOpenRequest` allows — or the reason it does not,
 * never a silently dead control.
 */
export function LevelSection({
	view,
	level,
	isOwner,
	pendingLevel,
	onStart,
}: {
	view: ShopVerificationResponse;
	level: 2 | 3;
	isOwner: boolean;
	pendingLevel: 2 | 3 | null;
	onStart: (level: 2 | 3) => void;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en-US" : "fr-FR";

	const request = view.requests[level === 2 ? "level2" : "level3"];
	const timeline = request ? buildTimeline(request) : [];
	const current = timeline[0];
	const result = canOpenRequest(view, level);
	const reason = isOwner
		? reasonLine(t, locale, result)
		: t("apiErrors.verification.notOwner");
	const allowed = isOwner && result.ok;
	const labelKey = request?.status === "approved" ? "renew" : "start";
	const resumable =
		view.enabled &&
		(request?.status === "draft" || request?.status === "needs_info");
	const isPending = pendingLevel === level;
	const ctaLabel = t(`verification.action.cta.${labelKey}`);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.cardTitle, { color: c.text }]}>
				{t(`verification.requestCard.title.${level}`)}
			</Text>

			{current ? (
				<View style={styles.sectionGap}>
					<ReviewerMessage entry={current} />
				</View>
			) : null}

			{timeline.length > 0 ? (
				<View style={styles.sectionGap}>
					<RequestTimeline entries={timeline} />
				</View>
			) : null}

			{resumable ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("verification.requestCard.continue")}
					onPress={() => onStart(level)}
					style={[
						styles.continueBtn,
						{ borderColor: c.primary, backgroundColor: c.primarySoft },
					]}
				>
					<Text style={[styles.continueLabel, { color: c.primary }]}>
						{t("verification.requestCard.continue")}
					</Text>
				</Pressable>
			) : null}

			<View style={styles.actionRow}>
				<Text style={[styles.actionLabel, { color: c.text }]}>
					{t(`verification.action.label.${labelKey}.${level}`)}
				</Text>
				{allowed ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={ctaLabel}
						disabled={isPending}
						onPress={() => onStart(level)}
						style={[
							styles.cta,
							{ backgroundColor: c.primary, opacity: isPending ? 0.6 : 1 },
						]}
					>
						{isPending ? (
							<ActivityIndicator color="#ffffff" size="small" />
						) : (
							<Text style={styles.ctaLabel}>{ctaLabel}</Text>
						)}
					</Pressable>
				) : (
					<View style={styles.reasonWrap}>
						<Text style={[styles.reason, { color: c.muted }]}>{reason}</Text>
						<View
							accessibilityRole="button"
							accessibilityLabel={ctaLabel}
							accessibilityState={{ disabled: true }}
							style={[styles.ctaDisabled, { backgroundColor: c.neutralSoft }]}
						>
							<Text style={[styles.ctaDisabledLabel, { color: c.muted }]}>
								{ctaLabel}
							</Text>
						</View>
					</View>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 4,
	},
	cardTitle: { fontSize: 15, fontFamily: Fonts.displayBold },
	sectionGap: { marginTop: 10 },
	continueBtn: {
		marginTop: 12,
		minHeight: 44,
		borderRadius: 10,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	continueLabel: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	actionRow: {
		marginTop: 14,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
		flexWrap: "wrap",
	},
	actionLabel: {
		flex: 1,
		fontSize: 13,
		fontFamily: Fonts.bodyMedium,
		minWidth: 120,
	},
	cta: {
		minHeight: 44,
		minWidth: 44,
		paddingHorizontal: 16,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	ctaLabel: { color: "#ffffff", fontSize: 13, fontFamily: Fonts.bodySemibold },
	reasonWrap: { alignItems: "flex-end", gap: 6 },
	reason: { fontSize: 11, fontFamily: Fonts.body, textAlign: "right" },
	ctaDisabled: {
		minHeight: 44,
		minWidth: 44,
		paddingHorizontal: 16,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	ctaDisabledLabel: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
