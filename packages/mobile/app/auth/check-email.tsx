import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { AuthSubmit, authErrorMessage } from "@/src/components/auth/AuthLayout";
import { useShopTheme } from "@/src/components/shop/theme";
import { useResendVerification } from "@/src/hooks/useEmailVerification";
import { useTranslation } from "@/src/lib/i18n";

/** The API sends at most one email a minute to an address. */
const COOLDOWN_SECONDS = 60;

/**
 * After sign-up, and after a sign-in refused for an unverified email: the
 * account waits on the link in its inbox, and the email can be sent again.
 */
export default function CheckEmailScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const params = useLocalSearchParams<{ email?: string; sent?: string }>();
	const email = params.email ?? "";
	const resend = useResendVerification();
	const [left, setLeft] = useState(params.sent === "1" ? COOLDOWN_SECONDS : 0);

	useEffect(() => {
		if (left <= 0) return;
		const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
		return () => clearTimeout(timer);
	}, [left]);

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<View style={styles.center}>
				<View style={[styles.iconTile, { backgroundColor: c.primarySoft }]}>
					<Ionicons name="mail-unread-outline" size={30} color={c.primary} />
				</View>
				<Text style={[styles.title, { color: c.text }]}>
					{t("auth.checkInboxTitle")}
				</Text>
				<Text style={[styles.subtitle, { color: c.muted }]}>
					{email
						? t("auth.checkInboxDesc", { email })
						: t("auth.checkInboxDescNoEmail")}
				</Text>
				<Text style={[styles.hint, { color: c.muted }]}>
					{t("auth.checkInboxSpam")}
				</Text>
				{resend.isSuccess && left > 0 ? (
					<Text style={[styles.hint, { color: c.success }]}>
						{t("auth.verificationResent")}
					</Text>
				) : null}
				{resend.isError ? (
					<Text style={[styles.hint, { color: c.danger }]}>
						{authErrorMessage(resend.error, t("auth.errorGeneric"))}
					</Text>
				) : null}
				<View style={styles.actions}>
					{email ? (
						<AuthSubmit
							label={
								left > 0
									? t("auth.resendVerificationIn", { seconds: left })
									: t("auth.resendVerification")
							}
							onPress={() =>
								resend.mutate(email, {
									onSuccess: () => setLeft(COOLDOWN_SECONDS),
								})
							}
							loading={resend.isPending}
							disabled={left > 0}
						/>
					) : null}
					<AuthSubmit
						label={t("auth.backToLogin")}
						onPress={() => router.replace("/auth/login")}
					/>
				</View>
			</View>
		</SafeAreaView>
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
	hint: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 19, marginTop: 12 },
	actions: { marginTop: 28, gap: 12 },
});
