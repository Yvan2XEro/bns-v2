import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useRegenerateHandoverCode } from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { OrderAction } from "@/src/lib/orderActions";
import { handoverCardState } from "@/src/lib/purchaseActions";
import type { OrderView } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";
import { Card, FieldError, PurchaseButton, purchaseText } from "./ui";

/**
 * The plaintext code exists only in the SMS sent at shipping and in the
 * answer to a regeneration, so the large digits appear once the buyer
 * regenerates; before that, the card says where the code went.
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

	return (
		<Card title={t("purchases.handoverTitle")} accent={c.primary}>
			{state.showCode ? (
				<View accessibilityLiveRegion="polite">
					<Text style={[purchaseText.muted, { color: c.body }]}>
						{t("purchases.handoverYourCode")}
					</Text>
					<Text
						style={[styles.code, { color: c.text }]}
						accessibilityLabel={code?.split("").join(" ")}
					>
						{code}
					</Text>
				</View>
			) : !state.locked ? (
				<Text style={[purchaseText.body, { color: c.body }]}>
					{t("purchases.handoverSentBySms")}
				</Text>
			) : null}

			<Text style={[styles.warning, { color: c.warningText }]}>
				{t("purchases.handoverBody")}
			</Text>

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

			<Text style={[purchaseText.muted, { color: c.muted }]}>
				{t("purchases.handoverRegenerateLeft", {
					count: state.regenerationsLeft,
				})}
			</Text>

			{state.canRegenerate ? (
				<PurchaseButton
					label={t("purchases.handoverRegenerate")}
					tone="outline"
					pending={regenerate.isPending}
					onPress={() => regenerate.mutate()}
				/>
			) : null}
			<FieldError
				message={
					regenerate.isError ? resolveErrorMessage(regenerate.error, t) : null
				}
			/>
		</Card>
	);
}

const styles = StyleSheet.create({
	code: {
		fontSize: 48,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: 12,
		marginTop: 4,
	},
	warning: { fontSize: 14, fontFamily: Fonts.bodySemibold, lineHeight: 20 },
	locked: { borderRadius: 12, padding: 12, gap: 6 },
	lockedTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
});
