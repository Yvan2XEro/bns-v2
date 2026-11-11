import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	AuthNotice,
	AuthNoticeText,
	AuthSubmit,
	authErrorMessage,
} from "@/src/components/auth/AuthLayout";
import { useResendVerification } from "@/src/hooks/useEmailVerification";
import { useTranslation } from "@/src/lib/i18n";

/** The API sends at most one email a minute to an address. */
const COOLDOWN_SECONDS = 60;

/**
 * After sign-up, and after a sign-in refused for an unverified email: the
 * account waits on the link in its inbox, and the email can be sent again.
 */
export default function CheckEmailScreen() {
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
		<AuthNotice
			icon="mail-unread-outline"
			title={t("auth.checkInboxTitle")}
			actions={
				<>
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
						variant={email ? "secondary" : "primary"}
						label={t("auth.backToLogin")}
						onPress={() => router.replace("/auth/login")}
					/>
				</>
			}
		>
			<AuthNoticeText>
				{email
					? t("auth.checkInboxDesc", { email })
					: t("auth.checkInboxDescNoEmail")}
			</AuthNoticeText>
			<AuthNoticeText tone="hint">{t("auth.checkInboxSpam")}</AuthNoticeText>
			{resend.isSuccess && left > 0 ? (
				<AuthNoticeText tone="success">
					{t("auth.verificationResent")}
				</AuthNoticeText>
			) : null}
			{resend.isError ? (
				<AuthNoticeText tone="danger">
					{authErrorMessage(resend.error, t("auth.errorGeneric"))}
				</AuthNoticeText>
			) : null}
		</AuthNotice>
	);
}
