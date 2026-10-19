import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
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
		if (!email || !password) {
			showError(t("auth.missingFieldsTitle"), t("auth.missingFieldsMessage"));
			return;
		}
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
			/>
			<AuthField
				label={t("auth.password")}
				icon="lock-closed-outline"
				value={password}
				onChangeText={setPassword}
				placeholder="••••••••"
				password
				autoCapitalize="none"
				autoComplete="password"
				returnKeyType="go"
				onSubmitEditing={handleLogin}
				trailingLabel={
					<Pressable
						onPress={() => router.push("/auth/forgot-password")}
						hitSlop={8}
						accessibilityRole="link"
					>
						<Text style={[styles.forgotLink, { color: c.primary }]}>
							{t("auth.forgotPassword")}
						</Text>
					</Pressable>
				}
			/>
			<AuthSubmit
				label={t("auth.signIn")}
				onPress={handleLogin}
				loading={loading}
			/>
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
	forgotLink: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
