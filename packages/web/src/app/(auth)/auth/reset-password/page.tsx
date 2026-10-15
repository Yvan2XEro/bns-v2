"use client";

import { Link2Off, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import {
	PasswordTipsAside,
	ResetStepsAside,
} from "~/components/auth/auth-asides";
import {
	AUTH_SUBMIT,
	AuthCard,
	AuthCardSkeleton,
	AuthStatusIcon,
} from "~/components/auth/auth-card";
import { AuthNotice, PasswordField } from "~/components/auth/auth-field";
import { useFieldIssues } from "~/components/auth/use-field-issues";
import { Button } from "~/components/ui/button";
import { resolveErrorMessage } from "~/lib/apiError";
import { PASSWORD_MIN_LENGTH, resetIssues } from "~/lib/auth-form";

const ORDER = ["password", "confirmPassword"] as const;

export default function ResetPasswordPage() {
	return (
		<Suspense fallback={<AuthCardSkeleton fields={2} footer={false} />}>
			<ResetPasswordForm />
		</Suspense>
	);
}

function ResetPasswordForm() {
	const t = useTranslations("Auth");
	const tErrors = useTranslations();
	const searchParams = useSearchParams();
	const router = useRouter();
	const token = searchParams.get("token");

	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const fields = useFieldIssues(
		{ password, confirmPassword },
		resetIssues,
		ORDER,
	);

	if (!token) {
		return (
			<AuthCard
				aside={<ResetStepsAside />}
				title={t("invalidLink")}
				description={t("invalidLinkDesc")}
				icon={
					<AuthStatusIcon>
						<Link2Off aria-hidden="true" className="h-7 w-7" />
					</AuthStatusIcon>
				}
			>
				<Button asChild variant="outline" className="h-12 w-full rounded-2xl">
					<Link href="/auth/forgot-password">{t("requestNewLink")}</Link>
				</Button>
			</AuthCard>
		);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		if (!fields.check()) return;
		setIsLoading(true);

		try {
			const response = await fetch("/api/users/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, password }),
				credentials: "include",
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(
					data.errors?.[0]?.message ||
						data.message ||
						"Failed to reset password",
				);
			}

			router.push("/auth/login?reset=success");
		} catch (err) {
			setError(resolveErrorMessage(err, tErrors));
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<AuthCard
			aside={<PasswordTipsAside />}
			title={t("resetPassword")}
			description={t("enterNewPassword")}
			icon={
				<AuthStatusIcon>
					<LockKeyhole aria-hidden="true" className="h-7 w-7" />
				</AuthStatusIcon>
			}
		>
			<form onSubmit={handleSubmit} noValidate className="space-y-5">
				{error && <AuthNotice tone="error">{error}</AuthNotice>}
				<PasswordField
					id="password"
					label={t("newPassword")}
					autoComplete="new-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					onBlur={() => fields.blur("password")}
					error={fields.error("password")}
					hint={t("passwordHint", { min: PASSWORD_MIN_LENGTH })}
					required
				/>
				<PasswordField
					id="confirmPassword"
					label={t("confirmNewPassword")}
					autoComplete="new-password"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
					onBlur={() => fields.blur("confirmPassword")}
					error={fields.error("confirmPassword")}
					required
				/>
				<Button type="submit" className={AUTH_SUBMIT} disabled={isLoading}>
					{isLoading ? t("resetting") : t("resetPassword")}
				</Button>
			</form>
		</AuthCard>
	);
}
