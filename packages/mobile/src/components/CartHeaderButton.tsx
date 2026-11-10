import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
	Pressable,
	type StyleProp,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useCart } from "@/src/hooks/useCart";
import { useAuth } from "@/src/lib/auth";
import { cartItemCount } from "@/src/lib/cartCount";
import { useTranslation } from "@/src/lib/i18n";

/**
 * The cart has no tab: this keeps it one tap away from the home, a listing
 * and a shop, with the number of items in it.
 */
export function CartHeaderButton({
	style,
	color,
	size = 20,
}: {
	style: StyleProp<ViewStyle>;
	color: string;
	size?: number;
}) {
	const { t } = useTranslation();
	const { user } = useAuth();
	const cart = useCart();
	if (!user) return null;
	const count = cartItemCount(cart.data);
	return (
		<Pressable
			onPress={() => router.push("/cart")}
			style={style}
			accessibilityRole="button"
			accessibilityLabel={
				count > 0 ? t("cart.headerLabel", { count }) : t("account.cart")
			}
		>
			<Ionicons name="bag-handle-outline" size={size} color={color} />
			{count > 0 && (
				<View
					style={{
						position: "absolute",
						top: -2,
						right: -2,
						minWidth: 18,
						height: 18,
						borderRadius: 9,
						paddingHorizontal: 4,
						backgroundColor: "#e5574b",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Text
						style={{ color: "#fff", fontSize: 11, fontFamily: Fonts.bodyBold }}
					>
						{count > 99 ? "99+" : count}
					</Text>
				</View>
			)}
		</Pressable>
	);
}
