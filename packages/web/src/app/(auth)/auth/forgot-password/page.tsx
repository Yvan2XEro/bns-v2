"use client";

import { KeyRound, MailCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ResetStepsAside } from "~/components/auth/auth-asides";
import {
	AUTH_LINK,
	AUTH_SUBMIT,
	AuthCard,
	AuthStatusIcon,
} from "~/components/auth/auth-card";
import { AuthField, AuthNotice } from "~/components/auth/auth-field";
import { useFieldIssues } from "~/components/auth/use-field-issues";
import { Button } from "~/components/ui/button";
import { resolveErrorMessage } from "~/lib/apiError";
import { forgotIssues } from "~/lib/auth-form";

const ORDER = ["email"] as const;

export default function ForgotPasswordPage() {
	const t = useTranslations("Auth");
	const tErrors = useTranslations();
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const fields = useFieldIssues({ email }, forgotIssues, ORDER);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		if (!fields.check()) return;
		setIsLoading(true);

		try {
			const response = await fetch("/api/users/forgot-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
				credentials: "include",
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(
					data.errors?.[0]?.message || data.message || "Request failed",
				);
			}

			setSuccess(true);
		} catch (err) {
			setError(resolveErrorMessage(err, tErrors));
		} finally {
			setIsLoading(false);
		}
	}

	if (success) {
		return (
			<AuthCard
				aside={<ResetStepsAside />}
				title={t("checkYourEmail")}
				description={t("checkYourEmailDesc")}
				icon={
					<AuthStatusIcon>
						<MailCheck aria-hidden="true" className="h-7 w-7" />
					</AuthStatusIcon>
				}
			>
				<Button asChild variant="outline" className="h-12 w-full rounded-2xl">
					<Link href="/auth/login">{t("backToSignIn")}</Link>
				</Button>
			</AuthCard>
		);
	}

	return (
		<AuthCard
			aside={<ResetStepsAside />}
			title={t("forgotPasswordTitle")}
			description={t("forgotPasswordDesc")}
			icon={
				<AuthStatusIcon>
					<KeyRound aria-hidden="true" className="h-7 w-7" />
				</AuthStatusIcon>
			}
			footer={
				<>
					{t("rememberPassword")}{" "}
					<Link href="/auth/login" className={AUTH_LINK}>
						{t("signIn")}
					</Link>
				</>
			}
		>
			<form onSubmit={handleSubmit} noValidate className="space-y-5">
				{error && <AuthNotice tone="error">{error}</AuthNotice>}
				<AuthField
					id="email"
					label={t("email")}
					type="email"
					autoComplete="email"
					inputMode="email"
					placeholder={t("emailPlaceholder")}
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					onBlur={() => fields.blur("email")}
					error={fields.error("email")}
					required
				/>
				<Button type="submit" className={AUTH_SUBMIT} disabled={isLoading}>
					{isLoading ? t("sending") : t("sendResetLink")}
				</Button>
			</form>
		</AuthCard>
	);
}
