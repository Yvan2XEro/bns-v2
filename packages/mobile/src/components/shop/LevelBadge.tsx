import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { badgeLabelKey } from "@/src/lib/verification";
import type { BadgeLevel } from "@/src/types/api";
import { useShopTheme } from "./theme";

const ICONS: Record<BadgeLevel, keyof typeof Ionicons.glyphMap> = {
	phone: "checkmark",
	identity: "shield-checkmark",
	business: "briefcase",
};

/** One badge per level, each with its own icon and tone: phone (neutral), identity (green), business (blue). */
export function LevelBadge({
	badge,
	size = "md",
}: {
	badge: BadgeLevel | null | undefined;
	size?: "sm" | "md";
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const labelKey = badgeLabelKey(badge);
	if (!badge || !labelKey) return null;

	const tone =
		badge === "identity"
			? { bg: c.successSoft, fg: c.successText }
			: badge === "business"
				? { bg: c.primarySoft, fg: c.primary }
				: { bg: c.neutralSoft, fg: c.body };

	return (
		<View
			style={[
				styles.badge,
				size === "sm" && styles.small,
				{ backgroundColor: tone.bg },
			]}
		>
			<Ionicons
				name={ICONS[badge]}
				size={size === "sm" ? 11 : 13}
				color={tone.fg}
			/>
			<Text
				style={[
					styles.text,
					size === "sm" && styles.smallText,
					{ color: tone.fg },
				]}
			>
				{t(`shop.${labelKey}`)}
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
