import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "../theme";

export function Header({
	onClose,
	title,
}: {
	onClose: () => void;
	title: string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View style={[styles.header, { borderBottomColor: c.border }]}>
			<Pressable
				onPress={onClose}
				accessibilityRole="button"
				accessibilityLabel={t("common.close")}
				hitSlop={12}
				style={styles.closeHit}
			>
				<Ionicons name="close" size={24} color={c.text} />
			</Pressable>
			<Text style={[styles.headerTitle, { color: c.text }]}>{title}</Text>
			<View style={{ width: 44 }} />
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 16,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	closeHit: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: { fontSize: 17, fontFamily: Fonts.displayBold },
});
