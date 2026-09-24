import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "./theme";

/** P1 knows level 1 only; levels 2 and 3 get their own badges in P2. */
export function LevelBadge({
	level,
	size = "md",
}: {
	level: number;
	size?: "sm" | "md";
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	if (level < 1) return null;

	return (
		<View
			style={[
				styles.badge,
				size === "sm" && styles.small,
				{ backgroundColor: c.neutralSoft },
			]}
		>
			<Ionicons
				name="checkmark"
				size={size === "sm" ? 11 : 13}
				color={c.body}
			/>
			<Text
				style={[
					styles.text,
					size === "sm" && styles.smallText,
					{ color: c.body },
				]}
			>
				{t("shop.levelPhone")}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		alignSelf: "flex-start",
		borderRadius: 999,
		paddingLeft: 6,
		paddingRight: 9,
		paddingVertical: 3,
	},
	small: { paddingVertical: 2, paddingLeft: 5, paddingRight: 7 },
	text: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	smallText: { fontSize: 11 },
});
