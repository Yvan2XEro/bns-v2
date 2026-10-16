import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { setAppMode } from "@/src/hooks/useAppMode";
import type { AppMode } from "@/src/lib/appMode";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "./theme";

/** Swaps the tab bar; the choice is remembered for the next launch. */
export function switchAppMode(target: AppMode) {
	setAppMode(target);
	// From the account pushed over the seller tabs: replace the tabs, not it.
	if (router.canDismiss()) router.dismissAll();
	router.replace(
		target === "seller" ? "/(seller-tabs)/sell/dashboard" : "/(tabs)/account",
	);
}

export function SwitchModeButton({ target }: { target: AppMode }) {
	const { t } = useTranslation();
	const toSeller = target === "seller";
	return (
		<SellerTabRow
			icon="swap-horizontal"
			label={
				toSeller
					? t("sellerMode.switchToSeller")
					: t("sellerMode.switchToBuyer")
			}
			sub={
				toSeller
					? t("sellerMode.switchToSellerSub")
					: t("sellerMode.switchToBuyerSub")
			}
			onPress={() => switchAppMode(target)}
		/>
	);
}

/** The buyer account, pushed over the seller tabs without leaving seller mode. */
export function MyAccountButton() {
	const { t } = useTranslation();
	return (
		<SellerTabRow
			icon="person-circle-outline"
			label={t("sellerMode.myAccount")}
			sub={t("sellerMode.myAccountSub")}
			onPress={() => router.push("/account/overview")}
		/>
	);
}

function SellerTabRow({
	icon,
	label,
	sub,
	onPress,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	sub: string;
	onPress: () => void;
}) {
	const c = useShopTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			style={({ pressed }) => [
				styles.row,
				{
					backgroundColor: c.card,
					borderColor: c.border,
					opacity: pressed ? 0.85 : 1,
				},
			]}
		>
			<View style={[styles.icon, { backgroundColor: c.primarySoft }]}>
				<Ionicons name={icon} size={18} color={c.primary} />
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.label, { color: c.text }]}>{label}</Text>
				<Text style={[styles.sub, { color: c.muted }]}>{sub}</Text>
			</View>
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 14,
		borderRadius: 14,
		borderWidth: 1,
	},
	icon: {
		width: 34,
		height: 34,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	label: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	sub: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
});
