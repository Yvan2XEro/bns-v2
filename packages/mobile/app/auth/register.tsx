import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
	AccessibilityInfo,
	Pressable,
	StyleSheet,
	Text,
	type TextInput,
	View,
} from "react-native";
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
import { type SocialAuthProvider, useAuth } from "@/src/lib/auth";
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
	// Back from "wrong address?" on the check-email screen, the form comes
	// back filled.
	const params = useLocalSearchParams<{
		redirect?: string;
		name?: string;
		email?: string;
	}>();
	const [name, setName] = useState(params.name ?? "");
	const [email, setEmail] = useState(params.email ?? "");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [socialLoading, setSocialLoading] = useState<SocialAuthProvider | null>(
		null,
	);
	// What the form refuses is said on the form: the field's border and a
	// line under it. The sheet is kept for what the server answers.
	const [missing, setMissing] = useState(false);
	// One password field: the reveal toggle replaces typing it twice.
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const emailRef = useRef<TextInput>(null);
	const passwordRef = useRef<TextInput>(null);

	const redirectTo = getSafeAuthRedirect(params.redirect);

	const finishAuth = () => {
		if (params.redirect) {
			router.replace(redirectTo);
			return;
		}

		router.dismiss();
	};

	const handleRegister = async () => {
		const empty = !name.trim() || !email.trim() || !password;
		const tooShort = password.length > 0 && password.length < 8;
		setMissing(empty);
		setPasswordError(tooShort ? t("auth.passwordTooShortMessage") : null);
		if (empty || tooShort) {
			AccessibilityInfo.announceForAccessibility(
				empty
					? t("auth.missingFieldsMessage")
					: t("auth.passwordTooShortMessage"),
			);
			return;
		}
		setLoading(true);
		try {
			const address = email.trim().toLowerCase();
			await register(name.trim(), address, password);
			// Signing in waits on the link just sent: say where to look.
			router.replace({
				pathname: "/auth/check-email",
				params: { email: address, name: name.trim(), sent: "1" },
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

	const handleSocialLogin = async (provider: SocialAuthProvider) => {
		setSocialLoading(provider);
		try {
			await loginWithProvider(provider, redirectTo);
			finishAuth();
		} catch (err: unknown) {
			showError(
				t("auth.registerFailedTitle"),
				authErrorMessage(err, t("auth.socialLoginFailedMessage")),
			);
		} finally {
			setSocialLoading(null);
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
			{/* One tap with Google beats four fields: the providers lead. */}
			<SocialAuthButtons
				onPress={handleSocialLogin}
				disabled={loading || socialLoading !== null}
				busy={socialLoading}
				placement="above"
			/>
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
				returnKeyType="go"
				onSubmitEditing={handleRegister}
				error={passwordError ?? (missing && !password)}
			/>
			<FormError message={missing ? t("auth.missingFieldsMessage") : null} />
			<AuthSubmit
				label={t("auth.createMyAccount")}
				onPress={handleRegister}
				loading={loading}
				disabled={socialLoading !== null}
			/>
			{/* The sentence, then each document as its own 44pt target: inline
			    13pt words were too small for a thumb. */}
			<View style={styles.terms}>
				<Text style={[styles.termsText, { color: c.muted }]}>
					{t("auth.termsAgreement")}
				</Text>
				<View style={styles.termsLinks}>
					<Pressable
						onPress={() => router.push("/terms")}
						accessibilityRole="link"
						hitSlop={10}
						style={styles.termsLinkHit}
					>
						<Text style={[styles.termsLink, { color: c.link }]}>
							{t("auth.termsLink")}
						</Text>
					</Pressable>
					<Pressable
						onPress={() => router.push("/privacy")}
						accessibilityRole="link"
						hitSlop={10}
						style={styles.termsLinkHit}
					>
						<Text style={[styles.termsLink, { color: c.link }]}>
							{t("auth.privacyLink")}
						</Text>
					</Pressable>
				</View>
			</View>
		</AuthScreen>
	);
}

const styles = StyleSheet.create({
	terms: { gap: 4 },
	termsText: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22 },
	termsLinks: { flexDirection: "row", flexWrap: "wrap", columnGap: 20 },
	termsLinkHit: { minHeight: 44, justifyContent: "center" },
	termsLink: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
});
