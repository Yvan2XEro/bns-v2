import { Ionicons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import {
	Pressable,
	type StyleProp,
	StyleSheet,
	type ViewStyle,
} from "react-native";
import { useIsDetailPane } from "@/src/contexts/DetailPaneContext";
import { useTranslation } from "@/src/lib/i18n";

/**
 * The back arrow every header uses. It removes itself in a split's detail
 * pane, where the list stays beside the screen and there is nothing to go
 * back to. Without a history (a deep link), it goes to `fallback`.
 */
export function HeaderBackButton({
	color,
	fallback,
	onPress,
	icon = "arrow-back",
	hidden = false,
	inline = false,
	style,
}: {
	color: string;
	fallback: Href;
	onPress?: () => void;
	icon?: "arrow-back" | "chevron-back" | "close";
	/** Also hidden where the caller knows there is no way back (a tab's root). */
	hidden?: boolean;
	/**
	 * Sized to its icon, for headers laid out around a bare icon; the hit
	 * slop keeps it as easy to reach.
	 */
	inline?: boolean;
	style?: StyleProp<ViewStyle>;
}) {
	const { t } = useTranslation();
	const inPane = useIsDetailPane();
	if (hidden || inPane) return null;
	const goBack =
		onPress ??
		(() => (router.canGoBack() ? router.back() : router.replace(fallback)));
	return (
		<Pressable
			onPress={goBack}
			style={[inline ? styles.inline : styles.button, style]}
			hitSlop={inline ? 12 : 8}
			accessibilityRole="button"
			accessibilityLabel={
				icon === "close" ? t("common.close") : t("common.back")
			}
		>
			<Ionicons name={icon} size={22} color={color} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	inline: { alignItems: "center", justifyContent: "center" },
	button: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
});
