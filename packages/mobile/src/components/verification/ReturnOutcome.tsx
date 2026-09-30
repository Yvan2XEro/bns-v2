import { Pressable, StyleSheet, Text } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import type { ReturnOutcome as ReturnOutcomeValue } from "@/src/hooks/useVerificationReturn";
import { useTranslation } from "@/src/lib/i18n";

/** `in_review` and a fresh `submitted` read the same to a seller: a person is looking at it now. */
function answerKey(status: string): string {
	if (status === "approved") return "approved";
	if (status === "needs_info") return "needsInfo";
	if (status === "rejected") return "rejected";
	if (status === "revoked") return "revoked";
	if (status === "expired") return "expired";
	return "submitted";
}

/** Renders exactly one of the poll's outcomes: still checking, a decline with attempts left, the timeout, or an answer. */
export function ReturnOutcome({
	outcome,
	onRetry,
	onRefresh,
}: {
	outcome: ReturnOutcomeValue;
	onRetry: () => void;
	onRefresh: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	if (outcome.kind === "polling") {
		return (
			<>
				<Text style={[styles.title, { color: c.text }]}>
					{t("verification.return.polling.title")}
				</Text>
				<Text style={[styles.body, { color: c.muted }]}>
					{t("verification.return.polling.body")}
				</Text>
			</>
		);
	}

	if (outcome.kind === "declinedRetry") {
		return (
			<>
				<Text style={[styles.title, { color: c.text }]}>
					{t("verification.return.outcome.declinedRetry.title")}
				</Text>
				<Text style={[styles.body, { color: c.muted }]}>
					{t("verification.return.outcome.declinedRetry.body")}
				</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t(
						"verification.return.outcome.declinedRetry.cta",
					)}
					onPress={onRetry}
					style={[styles.button, { backgroundColor: c.primary }]}
				>
					<Text style={styles.buttonLabel}>
						{t("verification.return.outcome.declinedRetry.cta")}
					</Text>
				</Pressable>
			</>
		);
	}

	if (outcome.kind === "timeout") {
		return (
			<>
				<Text style={[styles.title, { color: c.text }]}>
					{t("verification.return.outcome.timeout.title")}
				</Text>
				<Text style={[styles.body, { color: c.muted }]}>
					{t("verification.return.outcome.timeout.body")}
				</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("verification.return.outcome.timeout.cta")}
					onPress={onRefresh}
					style={[styles.button, { backgroundColor: c.primary }]}
				>
					<Text style={styles.buttonLabel}>
						{t("verification.return.outcome.timeout.cta")}
					</Text>
				</Pressable>
			</>
		);
	}

	const key = answerKey(outcome.status);
	return (
		<>
			<Text style={[styles.title, { color: c.text }]}>
				{t(`verification.return.outcome.answer.${key}.title`)}
			</Text>
			<Text style={[styles.body, { color: c.muted }]}>
				{t(`verification.return.outcome.answer.${key}.body`)}
			</Text>
		</>
	);
}

const styles = StyleSheet.create({
	title: { fontSize: 17, fontFamily: Fonts.displayBold, textAlign: "center" },
	body: { fontSize: 14, fontFamily: Fonts.body, textAlign: "center" },
	button: {
		minHeight: 44,
		minWidth: 44,
		paddingHorizontal: 20,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 8,
	},
	buttonLabel: {
		color: "#ffffff",
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},
});
