import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/src/lib/auth";
import { getSafeAuthRedirect } from "@/src/lib/authRedirect";
import { useTranslation } from "@/src/lib/i18n";

export default function AuthCallbackScreen() {
	const isDark = useColorScheme() === "dark";
	const { isLoading, user, completeOAuth } = useAuth();
	const { t } = useTranslation();
	const params = useLocalSearchParams<{
		oauthError?: string;
		redirect?: string;
		transferToken?: string;
	}>();
	const exchangeFailed = useRef(false);
	const redirectTo = getSafeAuthRedirect(params.redirect);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";

	// The deep link carries the transfer token. The login screen normally
	// exchanges it, but after a relaunch nobody else will: exchange it here
	// (shared with the login screen, so never twice).
	useEffect(() => {
		const transferToken = params.transferToken;
		if (typeof transferToken !== "string" || !transferToken) return;
		completeOAuth(transferToken).catch(() => {
			exchangeFailed.current = true;
			router.replace({
				pathname: "/auth/login",
				params: { oauthError: t("auth.loginFailedTitle") },
			});
		});
	}, [params.transferToken, completeOAuth, t]);

	useEffect(() => {
		if (isLoading || exchangeFailed.current) return;

		if (user) {
			router.replace(redirectTo);
			return;
		}

		if (typeof params.oauthError === "string" && params.oauthError.length > 0) {
			router.replace({
				pathname: "/auth/login",
				params: params.redirect
					? { oauthError: params.oauthError, redirect: redirectTo }
					: { oauthError: params.oauthError },
			});
		}
	}, [isLoading, params.oauthError, params.redirect, redirectTo, user]);

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			<View style={styles.content}>
				<ActivityIndicator size="large" color={primaryColor} />
				<Text style={[styles.title, { color: textColor }]}>
					{t("auth.callbackTitle")}
				</Text>
				<Text style={[styles.subtitle, { color: mutedColor }]}>
					{t("auth.callbackSubtitle")}
				</Text>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	content: {
		alignItems: "center",
		flex: 1,
		justifyContent: "center",
		paddingHorizontal: 24,
	},
	title: {
		fontFamily: Fonts.displaySemibold,
		fontSize: 20,
		marginTop: 18,
	},
	subtitle: {
		fontFamily: Fonts.body,
		fontSize: 14,
		marginTop: 8,
	},
});
