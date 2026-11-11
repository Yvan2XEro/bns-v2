import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, type TextInput } from "react-native";
import { Fonts } from "@/constants/theme";
import {
	AuthField,
	AuthScreen,
	AuthSubmit,
	AuthSwitchLink,
	authErrorMessage,
} from "@/src/components/auth/AuthLayout";
import { SocialAuthButtons } from "@/src/components/auth/SocialAuthButtons";
import { FormError } from "@/src/components/checkout/FormError";
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
	// What the form refuses is said on the form: the field's border and a
	// line under it. The sheet is kept for what the server answers.
	const [missing, setMissing] = useState(false);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [confirmError, setConfirmError] = useState<string | null>(null);
	const emailRef = useRef<TextInput>(null);
	const passwordRef = useRef<TextInput>(null);
	const confirmRef = useRef<TextInput>(null);

	const redirectTo = getSafeAuthRedirect(params.redirect);

	const finishAuth = () => {
		if (params.redirect) {
			router.replace(redirectTo);
			return;
		}

		router.dismiss();
	};

	const handleRegister = async () => {
		const empty = !name.trim() || !email.trim() || !password || !confirm;
		const tooShort = password.length > 0 && password.length < 8;
		const mismatch = !tooShort && confirm.length > 0 && password !== confirm;
		setMissing(empty);
		setPasswordError(tooShort ? t("auth.passwordTooShortMessage") : null);
		setConfirmError(mismatch ? t("auth.passwordMismatchMessage") : null);
		if (empty || tooShort || mismatch) return;
		setLoading(true);
		try {
			const address = email.trim().toLowerCase();
			await register(name.trim(), address, password);
			// Signing in waits on the link just sent: say where to look.
			router.replace({
				pathname: "/auth/check-email",
				params: { email: address, sent: "1" },
			});
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
				submitBehavior="submit"
				onSubmitEditing={() => emailRef.current?.focus()}
				error={missing && !name.trim()}
			/>
			<AuthField
				label={t("auth.email")}
				icon="mail-outline"
				inputRef={emailRef}
				value={email}
				onChangeText={setEmail}
				placeholder={t("auth.emailPlaceholder")}
				keyboardType="email-address"
				autoCapitalize="none"
				autoComplete="email"
				returnKeyType="next"
				submitBehavior="submit"
				onSubmitEditing={() => passwordRef.current?.focus()}
				error={missing && !email.trim()}
			/>
			<AuthField
				label={t("auth.password")}
				icon="lock-closed-outline"
				inputRef={passwordRef}
				value={password}
				onChangeText={(text) => {
					setPassword(text);
					if (passwordError && text.length >= 8) setPasswordError(null);
				}}
				placeholder={t("auth.passwordMinHint")}
				password
				autoCapitalize="none"
				autoComplete="new-password"
				returnKeyType="next"
				submitBehavior="submit"
				onSubmitEditing={() => confirmRef.current?.focus()}
				error={passwordError ?? (missing && !password)}
			/>
			<AuthField
				label={t("auth.confirmPassword")}
				icon="lock-closed-outline"
				inputRef={confirmRef}
				value={confirm}
				onChangeText={(text) => {
					setConfirm(text);
					if (confirmError && text === password) setConfirmError(null);
				}}
				error={confirmError ?? (missing && !confirm)}
				placeholder={t("auth.confirmPasswordPlaceholder")}
				password
				autoCapitalize="none"
				autoComplete="new-password"
				returnKeyType="go"
				onSubmitEditing={handleRegister}
			/>
			<FormError message={missing ? t("auth.missingFieldsMessage") : null} />
			<AuthSubmit
				label={t("auth.createMyAccount")}
				onPress={handleRegister}
				loading={loading}
			/>
			<Text style={[styles.termsText, { color: c.muted }]}>
				{t("auth.termsPrefix")}{" "}
				<Text
					style={[styles.termsLink, { color: c.link }]}
					onPress={() => router.push("/terms")}
					accessibilityRole="link"
				>
					{t("auth.termsLink")}
				</Text>{" "}
				{t("auth.privacyPrefix")}{" "}
				<Text
					style={[styles.termsLink, { color: c.link }]}
					onPress={() => router.push("/privacy")}
					accessibilityRole="link"
				>
					{t("auth.privacyLink")}
				</Text>
				.
			</Text>
			<SocialAuthButtons onPress={handleSocialLogin} disabled={loading} />
		</AuthScreen>
	);
}

const styles = StyleSheet.create({
	termsText: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 19 },
	termsLink: { fontFamily: Fonts.bodySemibold },
});
