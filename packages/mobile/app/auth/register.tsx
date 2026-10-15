import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Fonts } from "@/constants/theme";
import {
	AuthField,
	AuthScreen,
	AuthSubmit,
	AuthSwitchLink,
	authErrorMessage,
} from "@/src/components/auth/AuthLayout";
import { SocialAuthButtons } from "@/src/components/auth/SocialAuthButtons";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAuth } from "@/src/lib/auth";
import {
	getAuthModalParams,
	getSafeAuthRedirect,
} from "@/src/lib/authRedirect";
import { useTranslation } from "@/src/lib/i18n";

export default function RegisterScreen() {
	const c = useShopTheme();
	const { loginWithProvider, register } = useAuth();
	const { showError } = useAlert();
	const { t } = useTranslation();
	const params = useLocalSearchParams<{ redirect?: string }>();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);

	const redirectTo = getSafeAuthRedirect(params.redirect);

	const finishAuth = () => {
		if (params.redirect) {
			router.replace(redirectTo);
			return;
		}

		router.dismiss();
	};

	const handleRegister = async () => {
		if (!name || !email || !password || !confirm) {
			showError(t("auth.missingFieldsTitle"), t("auth.missingFieldsMessage"));
			return;
		}
		if (password.length < 8) {
			showError(
				t("auth.passwordTooShortTitle"),
				t("auth.passwordTooShortMessage"),
			);
			return;
		}
		if (password !== confirm) {
			showError(
				t("auth.passwordMismatchTitle"),
				t("auth.passwordMismatchMessage"),
			);
			return;
		}
		setLoading(true);
		try {
			await register(name.trim(), email.trim().toLowerCase(), password);
			finishAuth();
		} catch (err: unknown) {
			showError(
				t("auth.registerFailedTitle"),
				authErrorMessage(err, t("auth.registerFailedMessage")),
			);
		} finally {
			setLoading(false);
		}
	};

	const handleSocialLogin = async (
		provider: "apple" | "facebook" | "google",
	) => {
		setLoading(true);
		try {
			await loginWithProvider(provider, redirectTo);
			finishAuth();
		} catch (err: unknown) {
			showError(
				t("auth.registerFailedTitle"),
				authErrorMessage(err, t("auth.socialLoginFailedMessage")),
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<AuthScreen
			title={t("auth.registerTitle")}
			subtitle={t("auth.registerSubtitleShort")}
			onClose={() => router.dismiss()}
			footer={
				<AuthSwitchLink
					prompt={t("auth.alreadyHaveAccount")}
					action={t("auth.signIn")}
					onPress={() =>
						router.replace({
							pathname: "/auth/login",
							params: getAuthModalParams(params.redirect),
						})
					}
				/>
			}
		>
			<AuthField
				label={t("auth.name")}
				icon="person-outline"
				value={name}
				onChangeText={setName}
				placeholder={t("auth.fullNamePlaceholder")}
				autoCapitalize="words"
				autoComplete="name"
				returnKeyType="next"
			/>
			<AuthField
				label={t("auth.email")}
				icon="mail-outline"
				value={email}
				onChangeText={setEmail}
				placeholder={t("auth.emailPlaceholder")}
				keyboardType="email-address"
				autoCapitalize="none"
				autoComplete="email"
				returnKeyType="next"
			/>
			<AuthField
				label={t("auth.password")}
				icon="lock-closed-outline"
				value={password}
				onChangeText={setPassword}
				placeholder={t("auth.passwordMinHint")}
				password
				autoCapitalize="none"
				autoComplete="new-password"
				returnKeyType="next"
			/>
			<AuthField
				label={t("auth.confirmPassword")}
				icon="lock-closed-outline"
				value={confirm}
				onChangeText={setConfirm}
				placeholder={t("auth.confirmPasswordPlaceholder")}
				password
				autoCapitalize="none"
				autoComplete="new-password"
				returnKeyType="go"
				onSubmitEditing={handleRegister}
			/>
			<AuthSubmit
				label={t("auth.createMyAccount")}
				onPress={handleRegister}
				loading={loading}
			/>
			<Text style={[styles.termsText, { color: c.muted }]}>
				{t("auth.termsPrefix")}{" "}
				<Text
					style={[styles.termsLink, { color: c.primary }]}
					onPress={() => router.push("/terms")}
				>
					{t("auth.termsLink")}
				</Text>{" "}
				{t("auth.privacyPrefix")}{" "}
				<Text
					style={[styles.termsLink, { color: c.primary }]}
					onPress={() => router.push("/privacy")}
				>
					{t("auth.privacyLink")}
				</Text>
				.
			</Text>
			<SocialAuthButtons
				borderColor={c.border}
				mutedColor={c.muted}
				onPress={handleSocialLogin}
				primaryColor={c.primary}
			/>
		</AuthScreen>
	);
}

const styles = StyleSheet.create({
	termsText: { fontSize: 12, fontFamily: Fonts.body, lineHeight: 18 },
	termsLink: { fontFamily: Fonts.bodySemibold },
});
