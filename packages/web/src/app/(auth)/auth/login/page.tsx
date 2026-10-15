"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { AccountBenefitsAside } from "~/components/auth/auth-asides";
import {
	AUTH_LINK,
	AUTH_SUBMIT,
	AuthCard,
	AuthCardSkeleton,
} from "~/components/auth/auth-card";
import {
	AuthField,
	AuthNotice,
	PasswordField,
} from "~/components/auth/auth-field";
import {
	SocialAuthButtons,
	useSocialProviders,
} from "~/components/auth/social-auth-buttons";
import { useFieldIssues } from "~/components/auth/use-field-issues";
import { Button } from "~/components/ui/button";
import { useAuth } from "~/hooks/use-auth";
import { resolveErrorMessage } from "~/lib/apiError";
import { loginIssues } from "~/lib/auth-form";
import { safeReturnTo } from "~/lib/return-to";

const ORDER = ["email", "password"] as const;

export default function LoginPage() {
	return (
		<Suspense fallback={<AuthCardSkeleton fields={2} social formExtra />}>
			<LoginForm />
		</Suspense>
	);
}

function LoginForm() {
	const t = useTranslations("Auth");
	const tErrors = useTranslations();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const { login } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const providers = useSocialProviders();
	// Validated, not just defaulted: `router.push` follows a protocol-relative
	// value like "//evil.com" straight off the site, so an unchecked `redirect`
	// param is an open redirect — and a phishing link pointing at our own login
	// is more convincing than one that does not. `safeReturnTo` accepts only
	// same-origin paths.
	const redirectTo = safeReturnTo(searchParams.get("redirect")) ?? "/";
	const resetSuccess = searchParams.get("reset") === "success";
	const oauthError = searchParams.get("oauthError");
	const fields = useFieldIssues({ email, password }, loginIssues, ORDER);

	useEffect(() => {
		if (oauthError) {
			setError(t("socialLoginFailed"));
		}
	}, [oauthError, t]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		if (!fields.check()) return;
		setIsLoading(true);

		try {
			await login(email, password);
			router.push(redirectTo);
		} catch (err) {
			setError(resolveErrorMessage(err, tErrors, t("loginFailed")));
		} finally {
			setIsLoading(false);
		}
	}

	const registerHref =
		redirectTo === "/"
			? "/auth/register"
			: `/auth/register?redirect=${encodeURIComponent(redirectTo)}`;

	return (
		<AuthCard
			aside={<AccountBenefitsAside />}
			title={t("welcomeBack")}
			description={t("signInToYourAccount")}
			social={
				providers?.length === 0 ? undefined : (
					<SocialAuthButtons providers={providers} redirectTo={redirectTo} />
				)
			}
			footer={
				<>
					{t("dontHaveAccount")}{" "}
					<Link href={registerHref} className={AUTH_LINK}>
						{t("createAccountLink")}
					</Link>
				</>
			}
		>
			<form onSubmit={handleSubmit} noValidate className="space-y-5">
				{resetSuccess && (
					<AuthNotice tone="success">{t("resetSuccess")}</AuthNotice>
				)}
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
				<PasswordField
					id="password"
					label={t("password")}
					autoComplete="current-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					onBlur={() => fields.blur("password")}
					error={fields.error("password")}
					required
				/>
				<div className="-mt-2 flex justify-end">
					<Link href="/auth/forgot-password" className={`${AUTH_LINK} text-sm`}>
						{t("forgotPassword")}
					</Link>
				</div>
				<Button type="submit" className={AUTH_SUBMIT} disabled={isLoading}>
					{isLoading ? t("signingIn") : t("signIn")}
				</Button>
			</form>
		</AuthCard>
	);
}
