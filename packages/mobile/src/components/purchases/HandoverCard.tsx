import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useRegenerateHandoverCode } from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { OrderAction } from "@/src/lib/orderActions";
import { handoverCardState } from "@/src/lib/purchaseActions";
import type { OrderView } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";
import { FieldError, purchaseText } from "./ui";

/**
 * The API stores only a salted hash of the code, so there is nothing to fetch
 * back: the buyer asks for a fresh one, sent by SMS through the regenerate
 * route and its three-per-order budget. That route's answer also carries the
 * new code; it stays hidden behind a tap so it is never on screen by default.
 */
export function HandoverCard({
	order,
	actions,
}: {
	order: OrderView;
	actions: readonly OrderAction[];
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const regenerate = useRegenerateHandoverCode(order.id);
	const code = regenerate.data?.code;
	const state = handoverCardState(order, actions, code);
	const [revealed, setRevealed] = useState(false);

	return (
		<View style={[styles.card, { borderColor: c.isDark ? c.border : INK }]}>
			<View style={styles.head}>
				<Ionicons name="key-outline" size={18} color={AMBER} />
				<Text style={styles.title}>{t("purchases.handoverTitle")}</Text>
				<Text style={styles.sms}>{t("purchases.handoverAlsoSms")}</Text>
			</View>

			{state.showCode && code && !revealed ? (
				<>
					<Text style={styles.body}>{t("purchases.handoverResent")}</Text>
					<Pressable
						onPress={() => setRevealed(true)}
						accessibilityRole="button"
						style={styles.regenerate}
					>
						<Text style={styles.regenerateText}>
							{t("purchases.handoverReveal")}
						</Text>
					</Pressable>
				</>
			) : state.showCode && code ? (
				<View
					style={styles.digits}
					accessibilityLiveRegion="polite"
					accessibilityLabel={`${t("purchases.handoverYourCode")} ${code.split("").join(" ")}`}
				>
					{code.split("").map((digit, index) => (
						<View key={index} style={styles.digit}>
							<Text style={styles.digitText}>{digit}</Text>
						</View>
					))}
				</View>
			) : !state.locked ? (
				<Text style={styles.body}>{t("purchases.handoverSentBySms")}</Text>
			) : null}

			<View style={styles.warningRow}>
				<Ionicons name="warning-outline" size={16} color={AMBER} />
				<Text style={styles.warning}>{t("purchases.handoverWarning")}</Text>
			</View>

			{state.locked ? (
				<View style={[styles.locked, { backgroundColor: c.dangerSoft }]}>
					<View style={styles.lockedTitle}>
						<Ionicons name="lock-closed" size={16} color={c.dangerText} />
						<Text style={[purchaseText.strong, { color: c.dangerText }]}>
							{t("purchases.handoverLocked")}
						</Text>
					</View>
					{state.fallbackKeys.length > 0 ? (
						<Text style={[purchaseText.body, { color: c.text }]}>
							{t("purchases.handoverFallbacksIntro")}
						</Text>
					) : null}
					{state.fallbackKeys.map((key) => (
						<Text key={key} style={[purchaseText.body, { color: c.text }]}>
							{`• ${t(key)}`}
						</Text>
					))}
				</View>
			) : null}

			{state.canRegenerate ? (
				<Pressable
					onPress={() => {
						setRevealed(false);
						regenerate.mutate();
					}}
					disabled={regenerate.isPending}
					accessibilityRole="button"
					style={styles.regenerate}
				>
					{regenerate.isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.regenerateText}>
							{t("purchases.handoverResendSms")}
						</Text>
					)}
				</Pressable>
			) : null}
			<Text style={styles.muted}>
				{t("purchases.handoverRegenerateLeft", {
					count: state.regenerationsLeft,
				})}
			</Text>
			<FieldError
				message={
					regenerate.isError ? resolveErrorMessage(regenerate.error, t) : null
				}
			/>
		</View>
	);
}

/** The design system's ink: the card reads as the one thing to keep safe. */
const INK = "#0f172a";
const AMBER = "#fbbf24";

const styles = StyleSheet.create({
	card: {
		backgroundColor: INK,
		borderRadius: 16,
		borderWidth: 1,
		padding: 16,
		gap: 12,
	},
	head: { flexDirection: "row", alignItems: "center", gap: 8 },
	title: {
		flex: 1,
		color: "#fff",
		fontSize: 16,
		fontFamily: Fonts.displayBold,
	},
	sms: { color: "#94a3b8", fontSize: 12, fontFamily: Fonts.bodySemibold },
	body: {
		color: "#cbd5e1",
		fontSize: 14,
		fontFamily: Fonts.body,
		lineHeight: 20,
	},
	digits: { flexDirection: "row", gap: 8 },
	digit: {
		flex: 1,
		height: 64,
		borderRadius: 12,
		backgroundColor: "#1e293b",
		borderWidth: 1,
		borderColor: "#334155",
		alignItems: "center",
		justifyContent: "center",
	},
	digitText: {
		color: "#fff",
		fontSize: 30,
		fontFamily: Fonts.displayExtrabold,
	},
	warningRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
	warning: {
		flex: 1,
		color: AMBER,
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		lineHeight: 20,
	},
	regenerate: {
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#334155",
		alignItems: "center",
		justifyContent: "center",
	},
	regenerateText: {
		color: "#fff",
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
	},
	muted: { color: "#94a3b8", fontSize: 12, fontFamily: Fonts.body },
	locked: { borderRadius: 12, padding: 12, gap: 6 },
	lockedTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
});
