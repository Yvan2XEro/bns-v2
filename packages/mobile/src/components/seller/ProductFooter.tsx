import { Ionicons } from "@expo/vector-icons";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

/** Wizard back + primary action, or the editor's single save button. */
export function ProductFooter({
	creating,
	step,
	pending,
	readOnly,
	onBack,
	onPrimary,
}: {
	creating: boolean;
	step: 1 | 2 | 3;
	pending: boolean;
	readOnly: boolean;
	onBack: () => void;
	onPrimary: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	// Publishing is the sell action, so the last step wears signage yellow
	// with ink on it; the steps before it are ordinary indigo actions.
	const selling = creating && step === 3;
	const ink = selling
		? Colors.light.sunForeground
		: Colors.light.primaryForeground;
	const label = creating
		? step < 3
			? t("product.continue")
			: t("product.publish")
		: t("product.save");

	return (
		<View
			style={[
				styles.footer,
				{
					backgroundColor: c.card,
					borderTopColor: c.border,
					paddingBottom: Math.max(16, insets.bottom + 8),
				},
			]}
		>
			{creating && step > 1 ? (
				<Pressable
					onPress={onBack}
					style={({ pressed }) => [
						styles.back,
						{
							borderColor: c.border,
							backgroundColor: pressed ? c.primarySoft : "transparent",
						},
					]}
					accessibilityRole="button"
					accessibilityLabel={t("product.back")}
				>
					<Text style={[styles.backText, { color: c.text }]}>
						{t("product.back")}
					</Text>
				</Pressable>
			) : null}
			<Pressable
				onPress={onPrimary}
				disabled={pending || readOnly}
				style={({ pressed }) => [
					styles.primary,
					selling && styles.plaque,
					{
						backgroundColor: selling ? c.sell : c.fill,
						opacity: readOnly ? 0.5 : 1,
						transform: [{ scale: pressed && !pending ? 0.98 : 1 }],
					},
				]}
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityState={{
					busy: pending,
					disabled: pending || readOnly,
				}}
			>
				{pending ? (
					<ActivityIndicator color={ink} />
				) : (
					<>
						<Text style={[styles.primaryText, { color: ink }]}>{label}</Text>
						{creating && step < 3 ? (
							<Ionicons name="arrow-forward" size={18} color={ink} />
						) : null}
					</>
				)}
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	footer: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	back: {
		minHeight: 52,
		paddingHorizontal: 20,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	primary: {
		flex: 1,
		flexDirection: "row",
		gap: 8,
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	// The sell plaque's darker foot, as on the tab bar. No glow.
	plaque: { borderBottomWidth: 3, borderBottomColor: Colors.light.warning },
	backText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	primaryText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodyBold },
});
