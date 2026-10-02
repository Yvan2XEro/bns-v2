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

	return (
		<View style={styles.row}>
			<View style={[styles.chip, { backgroundColor: c.neutralSoft }]}>
				<Text style={[styles.text, { color: c.neutralText }]}>{text}</Text>
				{path ? (
					<Pressable
						accessibilityRole="link"
						accessibilityLabel={`${t("messages.systemOrderOpen")} — ${text}`}
						onPress={() => router.push(path)}
						style={styles.link}
					>
						<Text style={[styles.linkText, { color: c.primary }]}>
							{t("messages.systemOrderOpen")}
						</Text>
					</Pressable>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { alignItems: "center", marginVertical: 8, paddingHorizontal: 24 },
	chip: {
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingTop: 8,
		alignItems: "center",
		maxWidth: 420,
	},
	text: { fontSize: 13, fontFamily: Fonts.body, textAlign: "center" },
	link: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
	linkText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
