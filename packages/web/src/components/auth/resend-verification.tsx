"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { useResendVerification } from "~/hooks/use-email-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import { AuthNotice } from "./auth-field";

/** The API sends at most one email a minute to an address. */
const COOLDOWN_SECONDS = 60;

/**
 * "Send the email again", with the minute the API waits between two sends
 * counted down on the button rather than refused after the click.
 */
export function ResendVerification({
	email,
	startCooling = false,
}: {
	email: string;
	/** Right after sign-up: the first email has just left. */
	startCooling?: boolean;
}) {
	const t = useTranslations("Auth");
	const tErrors = useTranslations();
	const resend = useResendVerification();
	const [left, setLeft] = useState(startCooling ? COOLDOWN_SECONDS : 0);

	useEffect(() => {
		if (left <= 0) return;
		const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
		return () => clearTimeout(timer);
	}, [left]);

	return (
		<div className="space-y-3">
			{resend.isSuccess && left > 0 && (
				<AuthNotice tone="success">{t("verificationResent")}</AuthNotice>
			)}
			{resend.isError && (
				<AuthNotice tone="error">
					{resolveErrorMessage(resend.error, tErrors)}
				</AuthNotice>
			)}
			<Button
				type="button"
				variant="outline"
				className="h-12 w-full rounded-2xl"
				disabled={!email || left > 0 || resend.isPending}
				onClick={() =>
					resend.mutate(email, { onSuccess: () => setLeft(COOLDOWN_SECONDS) })
				}
			>
				{left > 0
					? t("resendVerificationIn", { seconds: left })
					: t("resendVerification")}
			</Button>
		</div>
	);
}
