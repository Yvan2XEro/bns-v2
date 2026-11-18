import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
	AuthField,
	AuthNotice,
	AuthNoticeText,
	AuthScreen,
	AuthSubmit,
	authErrorMessage,
} from "@/src/components/auth/AuthLayout";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";

export default function ForgotPasswordScreen() {
	const { showError } = useAlert();
	const { t } = useTranslation();
	// The address typed on the sign-in screen comes along.
	const params = useLocalSearchParams<{ email?: string }>();
	const [email, setEmail] = useState(params.email ?? "");
	const [loading, setLoading] = useState(false);
	const [sent, setSent] = useState(false);

	const handleSubmit = async () => {
		if (!email.trim()) return;
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
			<AuthNotice
				icon="mail-outline"
				title={t("auth.resetLinkSentTitle")}
				actions={
					<AuthSubmit
						label={t("auth.backToLogin")}
						onPress={() => router.dismiss()}
					/>
				}
			>
				<AuthNoticeText>{t("auth.resetLinkSentMessage")}</AuthNoticeText>
			</AuthNotice>
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
				disabled={!email.trim()}
			/>
		</AuthScreen>
	);
}
