import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "../theme";
import { Header } from "./Header";

/** Shown instead of the form when the flag is off: fails closed even on a direct deep link. */
export function ShopsUnavailable({
	onClose,
	title,
}: {
	onClose: () => void;
	title: string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<Header onClose={onClose} title={title} />
			<View style={styles.blocked}>
				<Ionicons name="storefront-outline" size={32} color={c.muted} />
				<Text style={[styles.blockedTitle, { color: c.text }]}>
					{t("shop.unavailableTitle")}
				</Text>
				<Text style={[styles.blockedBody, { color: c.muted }]}>
					{t("apiErrors.shop.disabled")}
				</Text>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	blocked: { alignItems: "center", gap: 10, padding: 32, marginTop: 40 },
	blockedTitle: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	blockedBody: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 20,
	},
});
