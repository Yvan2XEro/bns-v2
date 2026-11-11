import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, type TextInput } from "react-native";
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
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import {
	getAuthModalParams,
	getSafeAuthRedirect,
} from "@/src/lib/authRedirect";
import { useTranslation } from "@/src/lib/i18n";

export default function LoginScreen() {
	const c = useShopTheme();
	const { login, loginWithProvider } = useAuth();
	const { showError } = useAlert();
	const { t } = useTranslation();
	const params = useLocalSearchParams<{
		oauthError?: string;
		redirect?: string;
	}>();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	// Empty fields are said on the form, not in a sheet: the border marks
	// each one and a line under them says what is missing.
	const [missing, setMissing] = useState(false);
	const passwordRef = useRef<TextInput>(null);

	const redirectTo = getSafeAuthRedirect(params.redirect);

	const finishAuth = () => {
		if (params.redirect) {
			router.replace(redirectTo);
			return;
		}

		router.dismiss();
	};

	useEffect(() => {
		if (typeof params.oauthError !== "string" || !params.oauthError.length) {
			return;
		}

		showError(t("auth.loginFailedTitle"), params.oauthError);
	}, [params.oauthError, showError, t]);

	const handleLogin = async () => {
		if (!email.trim() || !password) {
			setMissing(true);
			return;
		}
		setMissing(false);
		setLoading(true);
		try {
			await login(email.trim().toLowerCase(), password);
			finishAuth();
		} catch (err: unknown) {
			// Not verified yet: the screen that waits on the link offers the resend.
			if (
				err instanceof ApiError &&
				err.code === ERROR_CODES.emailNotVerified
			) {
				router.replace({
					pathname: "/auth/check-email",
					params: { email: email.trim().toLowerCase() },
				});
				return;
			}
			showError(
				t("auth.loginFailedTitle"),
				authErrorMessage(err, t("auth.loginFailedMessage")),
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
				t("auth.loginFailedTitle"),
				authErrorMessage(err, t("auth.socialLoginFailedMessage")),
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<AuthScreen
			title={t("auth.loginTitle")}
			subtitle={t("auth.loginSubtitleShort")}
			onClose={() => router.dismiss()}
			footer={
				<AuthSwitchLink
					prompt={t("auth.noAccount")}
					action={t("auth.createAccount")}
					onPress={() =>
						router.replace({
							pathname: "/auth/register",
							params: getAuthModalParams(params.redirect),
						})
					}
				/>
			}
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
				onChangeText={setPassword}
				placeholder="••••••••"
				password
				error={missing && !password}
				autoCapitalize="none"
				autoComplete="password"
				returnKeyType="go"
				onSubmitEditing={handleLogin}
				trailingLabel={
					<Pressable
						onPress={() => router.push("/auth/forgot-password")}
						hitSlop={12}
						accessibilityRole="link"
					>
						<Text style={[styles.forgotLink, { color: c.link }]}>
							{t("auth.forgotPassword")}
						</Text>
					</Pressable>
				}
			/>
			<FormError message={missing ? t("auth.loginMissingFields") : null} />
			<AuthSubmit
				label={t("auth.signIn")}
				onPress={handleLogin}
				loading={loading}
			/>
			<SocialAuthButtons onPress={handleSocialLogin} disabled={loading} />
		</AuthScreen>
	);
}

const styles = StyleSheet.create({
	forgotLink: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.bodySemibold },
});
