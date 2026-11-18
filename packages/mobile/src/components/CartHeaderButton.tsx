import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import {
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	type ViewStyle,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";
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
			{count > 0 && <CartCount count={count} />}
		</Pressable>
	);
}

/**
 * The item count, on a yellow tag like a price. It hops once when the count
 * goes up, so an add made from a listing is seen landing in the bag.
 */
function CartCount({ count }: { count: number }) {
	const previous = useRef(count);
	const scale = useSharedValue(1);

	useEffect(() => {
		if (count > previous.current) {
			scale.value = withSequence(
				withTiming(1.35, { duration: 120 }),
				withTiming(1, { duration: 220 }),
			);
		}
		previous.current = count;
	}, [count, scale]);

	const style = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<Animated.View style={[styles.badge, style]}>
			<Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	badge: {
		position: "absolute",
		top: -3,
		right: -3,
		minWidth: 18,
		height: 18,
		borderRadius: 6,
		paddingHorizontal: 4,
		backgroundColor: "#ffb81c",
		alignItems: "center",
		justifyContent: "center",
	},
	badgeText: {
		color: "#12163a",
		fontSize: 11,
		lineHeight: 14,
		fontFamily: Fonts.bodyBold,
	},
});
