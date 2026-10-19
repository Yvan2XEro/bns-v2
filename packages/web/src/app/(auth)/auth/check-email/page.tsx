"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { AuthCard, AuthStatusIcon } from "~/components/auth/auth-card";
import { ResendVerification } from "~/components/auth/resend-verification";
import { Button } from "~/components/ui/button";
import { safeReturnTo } from "~/lib/return-to";

/**
 * After sign-up, and after a sign-in refused for an unverified email: the
 * account waits on the link in its inbox, and the email can be sent again.
 */
function CheckEmailContent() {
	const t = useTranslations("Auth");
	const params = useSearchParams();
	const email = params.get("email") ?? "";
	const justSent = params.get("sent") === "1";
	const redirectTo = safeReturnTo(params.get("redirect"));
	const loginHref = redirectTo
		? `/auth/login?redirect=${encodeURIComponent(redirectTo)}`
		: "/auth/login";

	return (
		<AuthCard
			title={t("checkInboxTitle")}
			description={
				email ? t("checkInboxDesc", { email }) : t("checkInboxDescNoEmail")
			}
			icon={
				<AuthStatusIcon>
					<MailCheck aria-hidden="true" className="h-7 w-7" />
				</AuthStatusIcon>
			}
		>
			<div className="space-y-3">
				<p className="text-ink-muted text-sm">{t("checkInboxSpam")}</p>
				{email && <ResendVerification email={email} startCooling={justSent} />}
				<Button asChild className="h-12 w-full rounded-2xl">
					<Link href={loginHref}>{t("backToSignIn")}</Link>
				</Button>
			</div>
		</AuthCard>
	);
}

/** `useSearchParams` reads the URL on the client only. */
export default function CheckEmailPage() {
	return (
		<Suspense fallback={null}>
			<CheckEmailContent />
		</Suspense>
	);
}
