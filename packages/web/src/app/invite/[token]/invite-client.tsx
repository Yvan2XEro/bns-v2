"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LevelBadge } from "~/components/shop/level-badge";
import { PhoneVerificationForm } from "~/components/shop/phone-verification/phone-verification-form";
import { ShopInitials } from "~/components/shop/shop-initials";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { useAuth } from "~/hooks/use-auth";
import {
	useAcceptInvitation,
	useDeclineInvitation,
	useInvitation,
} from "~/hooks/use-invitation";
import { ApiError, ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import { accountHint, type InviteViewer, inviteStep } from "~/lib/invite-flow";
import { invitationKey } from "~/lib/query-keys";
import type { PublicInvitationView } from "~/types";

// `redirect`, not `returnTo`: /auth/login and /auth/register read
// `searchParams.get("redirect")` and fall back to "/". The plan's brief named
// `returnTo`, which those pages ignore — an invitee would have signed in and
// landed on the home page with their invitation lost, and nothing would have
// reported it.
function returnToLogin(token: string) {
	return `/auth/login?redirect=${encodeURIComponent(`/invite/${token}`)}`;
}

function returnToRegister(token: string) {
	return `/auth/register?redirect=${encodeURIComponent(`/invite/${token}`)}`;
}

function ShopSummary({
	invitation,
	t,
	locale,
}: {
	invitation: PublicInvitationView;
	t: ReturnType<typeof useTranslations<"Invite">>;
	locale: string;
}) {
	const expires = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
		new Date(invitation.expiresAt),
	);
	const roleLabelKey =
		invitation.role === "manager" ? "roleManager" : "roleStaff";
	const roleDescriptionKey =
		invitation.role === "manager"
			? "roleManagerDescription"
			: "roleStaffDescription";

	return (
		<CardHeader className="items-center space-y-3 text-center">
			<ShopInitials
				name={invitation.shop.name}
				logoUrl={invitation.shop.logoUrl}
				className="h-16 w-16 text-xl"
			/>
			<div>
				<div className="flex items-center justify-center gap-2">
					<h1 className="font-bold text-[#0F172A] text-xl">
						{invitation.shop.name}
					</h1>
					<LevelBadge badge={invitation.shop.badge} size="sm" />
				</div>
				<p className="text-[#64748B] text-sm">@{invitation.shop.handle}</p>
			</div>
			{invitation.inviterFirstName && (
				<p className="text-[#334155] text-sm">
					{t("invitedBy", { name: invitation.inviterFirstName })}
				</p>
			)}
			<div className="rounded-xl bg-[#F8FAFC] px-4 py-2 text-sm">
				<p className="font-medium text-[#0F172A]">{t(roleLabelKey)}</p>
				<p className="mt-0.5 text-[#64748B] text-xs">{t(roleDescriptionKey)}</p>
			</div>
			<p className="text-[#94A3B8] text-xs">
				{t("expires", { date: expires })}
			</p>
		</CardHeader>
	);
}

/**
 * Four account states, one component: the server never tells us whether an
 * account exists for the invited target, so a signed-out visitor always sees
 * both "sign in" and "create an account" — only `inviteStep` decides which of
 * the nine screens applies, and the server's own refusal on accept is what
 * ultimately proves a match, never this page's own guess.
 */
export function InviteClient({ token }: { token: string }) {
	const t = useTranslations("Invite");
	const tErrors = useTranslations();
	const tCommon = useTranslations("Common");
	const locale = useLocale();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { user, isLoading: authLoading, refreshUser } = useAuth();

	const invitationQuery = useInvitation(token);
	const acceptMutation = useAcceptInvitation(token);
	const declineMutation = useDeclineInvitation(token);

	const [joined, setJoined] = useState(false);
	const [mismatchFromServer, setMismatchFromServer] = useState(false);
	const [actionError, setActionError] = useState<ApiError | null>(null);

	const invitation = invitationQuery.data ?? null;
	const viewer: InviteViewer | null = user
		? {
				email: user.email,
				phone: user.phone ?? null,
				phoneVerifiedAt: user.phoneVerifiedAt ?? null,
			}
		: null;

	const step = authLoading
		? "loading"
		: inviteStep({
				invitation,
				error: mismatchFromServer
					? ERROR_CODES.teamInvitationMismatch
					: (invitationQuery.error?.code ?? null),
				viewer,
				joined,
			});

	async function handleAccept() {
		setActionError(null);
		try {
			await acceptMutation.mutateAsync();
			setJoined(true);
			router.refresh();
			router.push("/seller");
		} catch (error) {
			if (!(error instanceof ApiError)) return;
			if (error.code === ERROR_CODES.teamInvitationMismatch) {
				setMismatchFromServer(true);
				return;
			}
			setActionError(error);
			// The token may simply have gone stale since the page loaded (used,
			// revoked, expired): refetching shows the real status instead of a
			// banner that never goes away.
			if (error.code === ERROR_CODES.teamInvitationInvalid) {
				void queryClient.invalidateQueries({ queryKey: invitationKey(token) });
			}
		}
	}

	async function handleDecline() {
		setActionError(null);
		try {
			await declineMutation.mutateAsync();
		} catch (error) {
			if (error instanceof ApiError) setActionError(error);
		}
	}

	if (step === "loading") {
		return (
			<div className="flex min-h-[50vh] items-center justify-center">
				<div className="h-40 w-full max-w-md animate-pulse rounded-2xl bg-[#F1F5F9]" />
			</div>
		);
	}

	if (step === "invalid" || !invitation) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center px-4">
				<Card className="w-full max-w-md">
					<CardContent className="space-y-4 py-8 text-center">
						<p className="text-[#334155]">{t("invalid")}</p>
						<Link href="/" className="text-[#1E40AF] text-sm hover:underline">
							{tCommon("back")}
						</Link>
					</CardContent>
				</Card>
			</div>
		);
	}

	const hint = accountHint(invitation);

	return (
		<div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
			<Card className="w-full max-w-md">
				<ShopSummary invitation={invitation} t={t} locale={locale} />
				<CardContent className="space-y-4">
					{step === "expired" && (
						<Message text={t("expired")} homeLabel={tCommon("back")} />
					)}
					{step === "responded" && (
						<Message text={t("responded")} homeLabel={tCommon("back")} />
					)}

					{step === "signIn" && (
						<div className="space-y-2">
							<Button asChild className="w-full">
								<Link href={returnToLogin(token)}>
									{t("signIn", { shop: invitation.shop.name })}
								</Link>
							</Button>
							<Button asChild variant="outline" className="w-full">
								<Link href={returnToRegister(token)}>{t("register")}</Link>
							</Button>
						</div>
					)}

					{step === "mismatch" && (
						<div className="space-y-3 text-center">
							<p className="text-[#334155] text-sm">
								{t("mismatch", { target: hint.maskedTarget })}
							</p>
							<Button asChild className="w-full">
								<Link href={returnToLogin(token)}>{t("switchAccount")}</Link>
							</Button>
						</div>
					)}

					{step === "verifyPhone" && (
						<div className="space-y-3">
							<p className="text-center font-medium text-[#0F172A] text-sm">
								{t("verifyPhone", { shop: invitation.shop.name })}
							</p>
							<p className="text-center text-[#64748B] text-xs">
								{t("verifyPhoneHint", { target: hint.maskedTarget })}
							</p>
							<PhoneVerificationForm onVerified={() => void refreshUser()} />
						</div>
					)}

					{step === "ready" && (
						<div className="space-y-3">
							{actionError && (
								<p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm">
									{resolveErrorMessage(actionError, tErrors)}
								</p>
							)}
							<Button
								onClick={() => void handleAccept()}
								disabled={acceptMutation.isPending || declineMutation.isPending}
								className="w-full"
							>
								{acceptMutation.isPending && (
									<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
								)}
								{t("join", { shop: invitation.shop.name })}
							</Button>
							<Button
								onClick={() => void handleDecline()}
								disabled={acceptMutation.isPending || declineMutation.isPending}
								variant="outline"
								className="w-full"
							>
								{declineMutation.isPending && (
									<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
								)}
								{t("decline")}
							</Button>
						</div>
					)}

					{step === "joined" && (
						<div className="space-y-3 text-center">
							<p className="text-[#0F172A] text-sm">
								{t("joined", { shop: invitation.shop.name })}
							</p>
							<Button asChild className="w-full">
								<Link href="/seller">{t("joinedCta")}</Link>
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function Message({ text, homeLabel }: { text: string; homeLabel: string }) {
	return (
		<div className="space-y-3 text-center">
			<p className="text-[#334155] text-sm">{text}</p>
			<Link href="/" className="text-[#1E40AF] text-sm hover:underline">
				{homeLabel}
			</Link>
		</div>
	);
}
