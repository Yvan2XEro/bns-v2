import { Ionicons } from "@expo/vector-icons";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import type { ShopStatus } from "@/src/types/api";
import type { ModerationPalette, Translate } from "./theme";

interface ShopActionBarProps {
	/** Mirrors the server's `canActOn`; hides the affordance, not just the submit. */
	actionable: boolean;
	status: ShopStatus;
	suspendPending: boolean;
	liftPending: boolean;
	onSuspend: () => void;
	onLift: () => void;
	c: ModerationPalette;
	t: Translate;
}

/** Bottom bar: suspend, lift, or an explanation when neither applies. */
export function ShopActionBar({
	actionable,
	status,
	suspendPending,
	liftPending,
	onSuspend,
	onLift,
	c,
	t,
}: ShopActionBarProps) {
	return (
		<View
			style={[
				styles.actions,
				{ backgroundColor: c.card, borderTopColor: c.border },
			]}
		>
			{!actionable ? (
				<Text
					style={[
						styles.meta,
						{ color: c.muted, textAlign: "center", flex: 1 },
					]}
				>
					{t("moderation.cannotActOnShop")}
				</Text>
			) : status === "suspended" ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("moderation.shopLift")}
					onPress={onLift}
					disabled={liftPending}
					style={[styles.btn, { backgroundColor: c.success }]}
				>
					{liftPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.btnText}>{t("moderation.shopLift")}</Text>
					)}
				</Pressable>
			) : status === "active" ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("moderation.shopSuspend")}
					onPress={onSuspend}
					disabled={suspendPending}
					style={[styles.btn, { backgroundColor: c.danger }]}
				>
					<Ionicons name="ban-outline" size={18} color="#fff" />
					<Text style={styles.btnText}>{t("moderation.shopSuspend")}</Text>
				</Pressable>
			) : (
				<Text
					style={[
						styles.meta,
						{ color: c.muted, textAlign: "center", flex: 1 },
					]}
				>
					{t("moderation.shopClosedNote")}
				</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	actions: {
		flexDirection: "row",
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
		paddingVertical: 14,
		minHeight: 44,
	},
	btnText: { fontSize: 15, fontFamily: Fonts.displayBold, color: "#fff" },
	meta: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
});
