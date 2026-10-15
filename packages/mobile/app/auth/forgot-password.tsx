import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import {
	AuthField,
	AuthScreen,
	AuthSubmit,
	authErrorMessage,
} from "@/src/components/auth/AuthLayout";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";

export default function ForgotPasswordScreen() {
	const c = useShopTheme();
	const { showError } = useAlert();
	const { t } = useTranslation();
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [sent, setSent] = useState(false);

	const handleSubmit = async () => {
		if (!email) return;
		setLoading(true);
		try {
			await api.post("/api/users/forgot-password", {
				email: email.trim().toLowerCase(),
			});
			setSent(true);
		} catch (err: unknown) {
			showError(
				t("auth.errorTitle"),
				authErrorMessage(err, t("auth.errorGeneric")),
			);
		} finally {
			setLoading(false);
		}
	};

	if (sent) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<View style={styles.center}>
					<View style={[styles.iconTile, { backgroundColor: c.primarySoft }]}>
						<Ionicons name="mail-outline" size={30} color={c.primary} />
					</View>
					<Text style={[styles.title, { color: c.text }]}>
						{t("auth.resetLinkSentTitle")}
					</Text>
					<Text style={[styles.subtitle, { color: c.muted }]}>
						{t("auth.resetLinkSentMessage")}
					</Text>
					<View style={styles.action}>
						<AuthSubmit
							label={t("auth.backToLogin")}
							onPress={() => router.dismiss()}
						/>
					</View>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<AuthScreen
			title={t("auth.resetTitle")}
			subtitle={t("auth.resetSubtitle")}
			onClose={() => router.back()}
			closeIcon="arrow-back"
		>
			<AuthField
				label={t("auth.email")}
				icon="mail-outline"
				value={email}
				onChangeText={setEmail}
				placeholder={t("auth.emailPlaceholder")}
				keyboardType="email-address"
				autoCapitalize="none"
				autoComplete="email"
				returnKeyType="send"
				onSubmitEditing={handleSubmit}
			/>
			<AuthSubmit
				label={t("auth.sendResetLink")}
				onPress={handleSubmit}
				loading={loading}
				disabled={!email}
			/>
		</AuthScreen>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, justifyContent: "center", padding: 24 },
	iconTile: {
		width: 64,
		height: 64,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	title: {
		fontSize: 26,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.4,
		marginTop: 20,
	},
	subtitle: {
		fontSize: 15,
		fontFamily: Fonts.body,
		lineHeight: 22,
		marginTop: 8,
	},
	action: { marginTop: 28 },
});
