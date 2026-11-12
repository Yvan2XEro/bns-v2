import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { FormButton } from "@/src/components/settings/FormButton";
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
	// A deep link with neither a token nor an error (an aborted browser, a
	// cold relaunch) would spin forever: after ten seconds, say so and offer
	// the way out.
	const [timedOut, setTimedOut] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => setTimedOut(true), 10_000);
		return () => clearTimeout(timer);
	}, []);
	const redirectTo = getSafeAuthRedirect(params.redirect);

	const c = Colors[isDark ? "dark" : "light"];
	const bg = c.background;
	const textColor = c.foreground;
	const mutedColor = c.mutedForeground;
	const primaryColor = c.link;

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
				params: { oauthError: "exchange" },
			});
		});
	}, [params.transferToken, completeOAuth]);

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
			{timedOut && !user ? (
				<View style={styles.content} accessibilityLiveRegion="polite">
					<Text
						accessibilityRole="header"
						style={[styles.title, { color: textColor }]}
					>
						{t("auth.callbackTimeoutTitle", {
							defaultValue: "La connexion n'a pas abouti",
						})}
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						{t("auth.callbackTimeoutBody", {
							defaultValue: "Réessayez, ou connectez-vous avec votre e-mail.",
						})}
					</Text>
					<View style={styles.actions}>
						<FormButton
							label={t("common.retry")}
							onPress={() =>
								router.replace({
									pathname: "/auth/login",
									params: params.redirect ? { redirect: redirectTo } : {},
								})
							}
						/>
						<FormButton
							variant="secondary"
							label={t("common.close")}
							onPress={() => router.replace("/(tabs)/home")}
						/>
					</View>
				</View>
			) : (
				<View style={styles.content}>
					<ActivityIndicator size="large" color={primaryColor} />
					<Text
						accessibilityRole="header"
						style={[styles.title, { color: textColor }]}
					>
						{t("auth.callbackTitle")}
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						{t("auth.callbackSubtitle")}
					</Text>
				</View>
			)}
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
	actions: { alignSelf: "stretch", gap: 12, marginTop: 28 },
	subtitle: {
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 22,
		marginTop: 8,
		textAlign: "center",
	},
});
