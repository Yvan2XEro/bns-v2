import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { PhoneGate, phoneStatusKey } from "@/src/components/shop/PhoneGate";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

const ACTIONS = ["publishListing", "revealPhone", "boost"] as const;
type GatedAction = (typeof ACTIONS)[number];

/**
 * The phone verification an action asked for (`usePhoneGate`), with what it
 * unlocks said in one line. Back to the action once verified.
 */
export default function VerifyPhoneScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const params = useLocalSearchParams<{ action?: string }>();
	const action: GatedAction =
		ACTIONS.find((value) => value === params.action) ?? "publishListing";

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<Pressable
				onPress={() => router.back()}
				accessibilityRole="button"
				accessibilityLabel={t("common.close")}
				style={styles.close}
				hitSlop={10}
			>
				<Ionicons name="close" size={24} color={c.text} />
			</Pressable>
			<KeyboardAwareScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
				<View style={[styles.iconTile, { backgroundColor: c.primarySoft }]}>
					<Ionicons name="phone-portrait-outline" size={28} color={c.primary} />
				</View>
				<Text style={[styles.title, { color: c.text }]}>
					{t(`accountTrust.${action}.title`)}
				</Text>
				<Text style={[styles.body, { color: c.muted }]}>
					{t(`accountTrust.${action}.body`)}
				</Text>
				<PhoneGate
					onVerified={() => {
						void queryClient.invalidateQueries({ queryKey: phoneStatusKey });
						router.back();
					}}
				/>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	close: { alignSelf: "flex-end", padding: 16 },
	content: { padding: 24, paddingTop: 0, gap: 12 },
	iconTile: {
		width: 56,
		height: 56,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	title: { fontSize: 24, fontFamily: Fonts.displayExtrabold, marginTop: 8 },
	body: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22 },
});
