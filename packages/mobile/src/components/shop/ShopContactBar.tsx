import { Ionicons } from "@expo/vector-icons";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
	withTiming,
} from "react-native-reanimated";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useShopBrand } from "./brand";
import { useShopTheme } from "./theme";

export const CONTACT_BAR_HEIGHT = 66;

/**
 * « Contacter la boutique » kept in reach once the header's own buttons have
 * scrolled away. The parent never mounts it on the viewer's own shop.
 */
export function ShopContactBar({
	visible,
	shown,
	insetBottom,
	pending,
	onContact,
	onWhatsapp,
}: {
	/** UI-thread flag, 1 when the bar should be on screen. */
	visible: SharedValue<number>;
	/** The JS mirror of `visible`, for touch targets and screen readers. */
	shown: boolean;
	insetBottom: number;
	pending: boolean;
	onContact: () => void;
	onWhatsapp: (() => void) | null;
}) {
	const c = useShopTheme();
	const brand = useShopBrand();
	const { t } = useTranslation();
	const height = CONTACT_BAR_HEIGHT + insetBottom;

	const style = useAnimatedStyle(() => ({
		transform: [
			{
				translateY: withTiming(visible.value ? 0 : height, { duration: 180 }),
			},
		],
	}));

	return (
		<Animated.View
			style={[
				styles.root,
				{
					height,
					paddingBottom: insetBottom,
					backgroundColor: c.card,
					borderTopColor: c.border,
				},
				style,
			]}
			pointerEvents={shown ? "auto" : "none"}
			accessibilityElementsHidden={!shown}
			importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
		>
			<View style={styles.row}>
				<Pressable
					onPress={onContact}
					disabled={pending}
					style={[
						styles.primary,
						{ backgroundColor: brand.accent, opacity: pending ? 0.7 : 1 },
					]}
					accessibilityRole="button"
					accessibilityLabel={t("shop.contactShop")}
				>
					{pending ? (
						<ActivityIndicator color={brand.onAccent} />
					) : (
						<>
							<Ionicons
								name="chatbox-outline"
								size={18}
								color={brand.onAccent}
							/>
							<Text style={[styles.primaryText, { color: brand.onAccent }]}>
								{t("shop.contactShop")}
							</Text>
						</>
					)}
				</Pressable>
				{onWhatsapp ? (
					<Pressable
						onPress={onWhatsapp}
						style={[styles.icon, { borderColor: c.border }]}
						accessibilityRole="button"
						accessibilityLabel={t("shop.whatsapp")}
					>
						<Ionicons name="logo-whatsapp" size={20} color="#16a34a" />
					</Pressable>
				) : null}
			</View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	root: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 15,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	row: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 10,
	},
	primary: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 46,
		borderRadius: 14,
	},
	primaryText: { fontSize: 15, fontFamily: Fonts.displayBold },
	icon: {
		width: 46,
		height: 46,
		borderRadius: 14,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
});
