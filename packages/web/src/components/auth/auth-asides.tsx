import {
	KeyRound,
	Link2,
	Mail,
	MessageCircle,
	ShieldCheck,
	Store,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AUTH_LINK, AuthAside } from "~/components/auth/auth-card";

const ICON = "h-4 w-4";

/** How a password reset goes, beside the forgot-password and invalid-link screens. */
export function ResetStepsAside() {
	const t = useTranslations("Auth");
	return (
		<AuthAside
			title={t("asideResetTitle")}
			points={[
				{ icon: <Mail className={ICON} />, text: t("asideResetStep1") },
				{ icon: <Link2 className={ICON} />, text: t("asideResetStep2") },
				{ icon: <KeyRound className={ICON} />, text: t("asideResetStep3") },
			]}
			footer={
				<>
					{t("asideHelp")}{" "}
					<Link href="/contact" className={AUTH_LINK}>
						{t("asideContact")}
					</Link>
				</>
			}
		/>
	);
}

/** What makes a good password, beside the new-password form. */
export function PasswordTipsAside() {
	const t = useTranslations("Auth");
	return (
		<AuthAside
			title={t("asideTipsTitle")}
			points={[
				{ icon: <KeyRound className={ICON} />, text: t("asideTip1") },
				{ icon: <ShieldCheck className={ICON} />, text: t("asideTip2") },
				{ icon: <Mail className={ICON} />, text: t("asideTip3") },
			]}
		/>
	);
}

/** Why an account is worth it, when no sign-in provider is enabled. */
export function AccountBenefitsAside() {
	const t = useTranslations("Auth");
	return (
		<AuthAside
			title={t("asideBenefitsTitle")}
			points={[
				{ icon: <MessageCircle className={ICON} />, text: t("asideBenefit1") },
				{ icon: <Store className={ICON} />, text: t("asideBenefit2") },
				{ icon: <ShieldCheck className={ICON} />, text: t("asideBenefit3") },
			]}
		/>
	);
}
