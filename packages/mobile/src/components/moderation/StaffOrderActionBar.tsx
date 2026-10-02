import { Ionicons } from "@expo/vector-icons";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import type { ModerationPalette, Translate } from "./theme";

interface StaffOrderActionBarProps {
	/** Both flags come from `availableActions(order, "staff")`, never from a status test here. */
	canCancel: boolean;
	canReceipt: boolean;
	receiptPending: boolean;
	onCancel: () => void;
	onReceipt: () => void;
	c: ModerationPalette;
	t: Translate;
}

export function StaffOrderActionBar({
	canCancel,
	canReceipt,
	receiptPending,
	onCancel,
	onReceipt,
	c,
	t,
}: StaffOrderActionBarProps) {
	return (
		<View
			style={[
				styles.bar,
				{ backgroundColor: c.card, borderTopColor: c.border },
			]}
		>
			{canReceipt ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("moderationOrder.receipt")}
					accessibilityState={{ busy: receiptPending }}
					onPress={onReceipt}
					disabled={receiptPending}
					style={[
						styles.btn,
						{ backgroundColor: c.bg, borderColor: c.border, borderWidth: 1 },
					]}
				>
					{receiptPending ? (
						<ActivityIndicator color={c.primary} />
					) : (
						<Ionicons name="receipt-outline" size={18} color={c.primary} />
					)}
					<Text style={[styles.btnText, { color: c.primary }]}>
						{t("moderationOrder.receipt")}
					</Text>
				</Pressable>
			) : null}
			{canCancel ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("moderationOrder.cancel")}
					onPress={onCancel}
					style={[styles.btn, { backgroundColor: c.danger }]}
				>
					<Ionicons name="close-circle-outline" size={18} color="#fff" />
					<Text style={[styles.btnText, { color: "#fff" }]}>
						{t("moderationOrder.cancel")}
					</Text>
				</Pressable>
			) : null}
			{!canCancel && !canReceipt ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("moderationOrder.noAction")}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		gap: 10,
		padding: 16,
		paddingBottom: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	btn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 14,
		paddingVertical: 12,
		minHeight: 44,
	},
	btnText: { fontSize: 15, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body, flex: 1, textAlign: "center" },
});
