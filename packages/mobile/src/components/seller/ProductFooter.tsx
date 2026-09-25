import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formStyles as f } from "./formStyles";

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
	const label = creating
		? step < 3
			? t("product.continue")
			: t("product.publish")
		: t("product.save");

	return (
		<View
			style={[
				styles.footer,
				{ backgroundColor: c.card, borderTopColor: c.border },
			]}
		>
			{creating && step > 1 ? (
				<Pressable
					onPress={onBack}
					style={[styles.back, { borderColor: c.border }]}
					accessibilityRole="button"
					accessibilityLabel={t("product.back")}
				>
					<Text style={[f.label, { color: c.text }]}>{t("product.back")}</Text>
				</Pressable>
			) : null}
			<Pressable
				onPress={onPrimary}
				disabled={pending || readOnly}
				style={[
					styles.primary,
					{
						backgroundColor: creating && step === 3 ? c.sell : c.primary,
						opacity: readOnly ? 0.5 : 1,
					},
				]}
				accessibilityRole="button"
				accessibilityLabel={label}
			>
				{pending ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.primaryText}>{label}</Text>
				)}
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	footer: {
		flexDirection: "row",
		gap: 10,
		padding: 16,
		paddingBottom: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	back: {
		height: 52,
		paddingHorizontal: 18,
		borderRadius: 14,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	primary: {
		flex: 1,
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	primaryText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
