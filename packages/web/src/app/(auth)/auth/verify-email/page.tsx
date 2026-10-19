"use client";

import { CircleAlert, LoaderCircle, MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { AuthCard, AuthStatusIcon } from "~/components/auth/auth-card";
import { AuthField } from "~/components/auth/auth-field";
import { ResendVerification } from "~/components/auth/resend-verification";
import { Button } from "~/components/ui/button";
import { useVerifyEmail } from "~/hooks/use-email-verification";

/** Where the link in the verification email leads. */
function VerifyEmailContent() {
	const t = useTranslations("Auth");
	const token = useSearchParams().get("token");
	const verify = useVerifyEmail(token);
	const [email, setEmail] = useState("");

	if (token && verify.isPending) {
		return (
			<AuthCard
				title={t("verifyingEmail")}
				icon={
					<AuthStatusIcon>
						<LoaderCircle aria-hidden="true" className="h-7 w-7 animate-spin" />
					</AuthStatusIcon>
				}
			>
				{null}
			</AuthCard>
		);
	}

	if (verify.isSuccess) {
		return (
			<AuthCard
				title={t("emailVerifiedTitle")}
				description={t("emailVerifiedDesc")}
				icon={
					<AuthStatusIcon>
						<MailCheck aria-hidden="true" className="h-7 w-7" />
					</AuthStatusIcon>
				}
			>
				<Button asChild className="h-12 w-full rounded-2xl">
					<Link href="/auth/login">{t("signIn")}</Link>
				</Button>
			</AuthCard>
		);
	}

	// No token, or one already used or replaced by a newer email.
	return (
		<AuthCard
			title={t("verifyFailedTitle")}
			description={t("verifyFailedDesc")}
			icon={
				<AuthStatusIcon>
					<CircleAlert aria-hidden="true" className="h-7 w-7" />
				</AuthStatusIcon>
			}
		>
			<div className="space-y-4">
				<AuthField
					id="email"
					label={t("email")}
					type="email"
					autoComplete="email"
					inputMode="email"
					placeholder={t("emailPlaceholder")}
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<ResendVerification email={email.trim()} />
				<Button asChild variant="ghost" className="h-12 w-full rounded-2xl">
					<Link href="/auth/login">{t("backToSignIn")}</Link>
				</Button>
			</div>
		</AuthCard>
	);
}

/** `useSearchParams` reads the URL on the client only. */
export default function VerifyEmailPage() {
	return (
		<Suspense fallback={null}>
			<VerifyEmailContent />
		</Suspense>
	);
}
