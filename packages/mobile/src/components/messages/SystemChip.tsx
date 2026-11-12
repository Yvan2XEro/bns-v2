import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	type SystemMessageLike,
	systemChip,
	systemMessageOrderPath,
} from "@/src/lib/systemMessage";

/** An order event in the thread: a centred line, and a link to the order from whichever side is reading. */
export function SystemChip({
	message,
	side,
}: {
	message: SystemMessageLike;
	side: "buyer" | "shop";
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const chip = systemChip(message);
	const text =
		chip.kind === "key"
			? t(chip.key, { orderNumber: chip.orderNumber })
			: chip.text;
	const path = systemMessageOrderPath(message, side);
	// The dark primary reads under 4.5:1 on the night chip; its lighter
	// tone does not.
	const link = c.link;

	return (
		<View style={styles.row}>
			<View
				style={[
					styles.chip,
					path ? null : styles.chipPlain,
					{ backgroundColor: c.neutralSoft, borderColor: c.border },
				]}
			>
				<View style={styles.line}>
					<Ionicons name="receipt-outline" size={14} color={c.neutralText} />
					<Text style={[styles.text, { color: c.neutralText }]}>{text}</Text>
				</View>
				{path ? (
					<Pressable
						accessibilityRole="link"
						accessibilityLabel={`${t("messages.systemOrderOpen")} — ${text}`}
						onPress={() => router.push(path)}
						style={({ pressed }) => [
							styles.link,
							{ opacity: pressed ? 0.6 : 1 },
						]}
					>
						<Text style={[styles.linkText, { color: link }]}>
							{t("messages.systemOrderOpen")}
						</Text>
						<Ionicons name="chevron-forward" size={14} color={link} />
					</Pressable>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { alignItems: "center", marginVertical: 10, paddingHorizontal: 24 },
	chip: {
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 14,
		paddingTop: 8,
		alignItems: "center",
		maxWidth: 420,
	},
	// Without a link under it the chip closes on its own padding.
	chipPlain: { paddingBottom: 8 },
	line: { flexDirection: "row", alignItems: "center", gap: 6 },
	text: {
		flexShrink: 1,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodyMedium,
		textAlign: "center",
	},
	link: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		minHeight: 44,
		paddingHorizontal: 8,
	},
	linkText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodyBold },
});
