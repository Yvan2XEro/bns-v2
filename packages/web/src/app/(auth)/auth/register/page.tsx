"use client";

import { Check } from "lucide-react";
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
import { PASSWORD_MIN_LENGTH, registerIssues } from "~/lib/auth-form";
import { safeReturnTo } from "~/lib/return-to";
import { cn } from "~/lib/utils";

const ORDER = ["name", "email", "password", "confirmPassword"] as const;

export default function RegisterPage() {
	return (
		<Suspense fallback={<AuthCardSkeleton fields={4} social formExtra />}>
			<RegisterForm />
		</Suspense>
	);
}

function RegisterForm() {
	const t = useTranslations("Auth");
	const tErrors = useTranslations();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const { register } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const providers = useSocialProviders();
	const oauthError = searchParams.get("oauthError");
	// Registration used to push "/" unconditionally, so any flow that sends
	// someone here to finish something lost it at the last step — a team
	// invitation being the case that surfaced it. `safeReturnTo` accepts only
	// same-origin paths, so this cannot become an open redirect.
	const redirectTo = safeReturnTo(searchParams.get("redirect")) ?? "/";
	const fields = useFieldIssues(
		{ name, email, password, confirmPassword },
		registerIssues,
		ORDER,
	);
	const longEnough = password.length >= PASSWORD_MIN_LENGTH;

	useEffect(() => {
		if (oauthError) {
			setError(t("socialSignupFailed"));
		}
	}, [oauthError, t]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		if (!fields.check()) return;
		setIsLoading(true);

		try {
			await register(email, password, name);
			router.push(redirectTo);
		} catch (err) {
			setError(resolveErrorMessage(err, tErrors, t("registrationFailed")));
		} finally {
			setIsLoading(false);
		}
	}

	const loginHref =
		redirectTo === "/"
			? "/auth/login"
			: `/auth/login?redirect=${encodeURIComponent(redirectTo)}`;

	return (
		<AuthCard
			aside={<AccountBenefitsAside />}
			title={t("createAccount")}
			description={t("joinAndStartTrading")}
			social={
				providers?.length === 0 ? undefined : (
					<SocialAuthButtons providers={providers} redirectTo={redirectTo} />
				)
			}
			footer={
				<>
					{t("alreadyHaveAccount")}{" "}
					<Link href={loginHref} className={AUTH_LINK}>
						{t("signIn")}
					</Link>
				</>
			}
		>
			<form onSubmit={handleSubmit} noValidate className="space-y-5">
				{error && <AuthNotice tone="error">{error}</AuthNotice>}
				<AuthField
					id="name"
					label={t("name")}
					type="text"
					autoComplete="name"
					placeholder={t("namePlaceholder")}
					value={name}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => fields.blur("name")}
					error={fields.error("name")}
					required
				/>
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
					autoComplete="new-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					onBlur={() => fields.blur("password")}
					error={fields.error("password")}
					required
					hint={
						<span
							className={cn(
								"flex items-center gap-1.5 transition-colors",
								longEnough && "text-[#047857]",
							)}
						>
							<Check
								aria-hidden="true"
								className={cn("h-3.5 w-3.5", !longEnough && "opacity-40")}
							/>
							{t("passwordHint", { min: PASSWORD_MIN_LENGTH })}
						</span>
					}
				/>
				<PasswordField
					id="confirmPassword"
					label={t("confirmPassword")}
					autoComplete="new-password"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
					onBlur={() => fields.blur("confirmPassword")}
					error={fields.error("confirmPassword")}
					required
				/>
				<Button type="submit" className={AUTH_SUBMIT} disabled={isLoading}>
					{isLoading ? t("creatingAccount") : t("createAccountBtn")}
				</Button>
				<p className="text-center text-ink-muted text-xs leading-relaxed">
					{t.rich("acceptTerms", {
						terms: (chunks) => (
							<Link href="/terms" className={AUTH_LINK}>
								{chunks}
							</Link>
						),
						privacy: (chunks) => (
							<Link href="/privacy" className={AUTH_LINK}>
								{chunks}
							</Link>
						),
					})}
				</p>
			</form>
		</AuthCard>
	);
}
