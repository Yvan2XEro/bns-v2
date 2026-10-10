"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import {
	usePaymentSetup,
	useStartOnboarding,
} from "~/hooks/use-seller-payments";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import {
	CONNECTED_ACCOUNT_STATUSES,
	type ConnectedAccountStatus,
	PAYOUT_ACCOUNT_STATUSES,
	PAYOUT_METHODS,
	type PayoutAccountStatus,
	type PayoutMethod,
} from "~/lib/payment-status";
import { notMeAccountId } from "~/lib/payout-account-form";
import { useLocaleKey } from "~/lib/use-locale-key";
import { HoldList } from "../hold-list";
import { NotMeBanner } from "./not-me-banner";
import { PayoutAccountForm } from "./payout-account-form";
import { StepHeader } from "./step-header";

function isConnectedAccountStatus(
	value: string,
): value is ConnectedAccountStatus {
	return Object.hasOwn(CONNECTED_ACCOUNT_STATUSES, value);
}

function isPayoutAccountStatus(value: string): value is PayoutAccountStatus {
	return Object.hasOwn(PAYOUT_ACCOUNT_STATUSES, value);
}

function isPayoutMethod(value: string): value is PayoutMethod {
	return Object.hasOwn(PAYOUT_METHODS, value);
}

export function SetupClient({ shopId }: { shopId: string }) {
	const t = useTranslations("Payments");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const searchParams = useSearchParams();
	const onboardingDone = searchParams.get("onboarding") === "done";
	const setup = usePaymentSetup(shopId, { onboardingDone });
	const startOnboarding = useStartOnboarding(shopId);

	if (setup.isPending) return <LoadingRows rows={4} />;
	if (setup.isError) {
		return (
			<LoadError
				title={`${t("setup_title")} — ${resolveErrorMessage(setup.error, tRoot)}`}
				onRetry={() => void setup.refetch()}
			/>
		);
	}

	const view = setup.data;

	// `flagEnabled` is server-decided per market: off means the whole screen
	// says "coming soon", even for a shop that was eligible before the flag
	// was turned back off — the ledger and payouts keep running regardless
	// (global constraint), this screen just stops offering new onboarding.
	if (!view.flagEnabled) {
		return (
			<div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center text-[#64748B] text-sm">
				{t("setup_comingSoon")}
			</div>
		);
	}

	const notMeId = notMeAccountId(shopId, {
		shop: searchParams.get("shop"),
		notMe: searchParams.get("notMe"),
	});

	const step1Done = view.ineligibleReason !== "level";
	const account = view.connectedAccount;
	const step2Done = account?.chargesEnabled === true;
	const cooldownActive = Boolean(view.changeCooldownUntil);

	return (
		<div className="space-y-6">
			<h1 className="font-bold text-2xl text-[#0F172A]">{t("setup_title")}</h1>

			{notMeId && <NotMeBanner shopId={shopId} accountId={notMeId} />}

			<HoldList holds={view.holds} />

			<section className="space-y-2 rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<StepHeader done={step1Done} title={t("setup_step1Title")} />
				<p className="text-[#64748B] text-sm">{t("setup_step1Body")}</p>
				{!step1Done && (
					<Link
						href="/seller/verification/identity"
						className="inline-flex min-h-10 items-center rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					>
						{t("setup_step1Action")}
					</Link>
				)}
			</section>

			<section className="space-y-2 rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<StepHeader done={step2Done} title={t("setup_step2Title")} />
				<p className="text-[#64748B] text-sm">{t("setup_step2Body")}</p>
				{account && (
					<p className="text-[#334155] text-sm">
						{isConnectedAccountStatus(account.status)
							? t(CONNECTED_ACCOUNT_STATUSES[account.status])
							: account.status}
					</p>
				)}
				{account && account.requirementsDue.length > 0 && (
					<div className="space-y-1">
						<p className="text-[#92400E] text-xs">
							{t("setup_requirementsDue")}
						</p>
						<ul className="list-disc space-y-0.5 pl-4 text-[#92400E] text-xs">
							{account.requirementsDue.map((requirement) => (
								<li key={requirement}>{requirement}</li>
							))}
						</ul>
					</div>
				)}
				{step1Done && !step2Done && (
					<button
						type="button"
						disabled={startOnboarding.isPending || !view.eligible}
						onClick={() => {
							startOnboarding.mutate(undefined, {
								onSuccess: ({ url }) => {
									window.location.href = url;
								},
							});
						}}
						className="h-10 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A] disabled:opacity-50"
					>
						{t("setup_step2Action")}
					</button>
				)}
				{startOnboarding.isError && (
					<p className="text-red-600 text-xs">
						{resolveErrorMessage(startOnboarding.error, tRoot)}
					</p>
				)}
			</section>

			<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<StepHeader
					done={Boolean(view.payoutAccount)}
					title={t("setup_step3Title")}
				/>
				{view.payoutAccount && (
					<p className="text-[#334155] text-sm">
						{isPayoutMethod(view.payoutAccount.method)
							? t(PAYOUT_METHODS[view.payoutAccount.method])
							: view.payoutAccount.method}{" "}
						— {view.payoutAccount.accountNumberMasked} —{" "}
						{isPayoutAccountStatus(view.payoutAccount.status)
							? t(PAYOUT_ACCOUNT_STATUSES[view.payoutAccount.status])
							: view.payoutAccount.status}
					</p>
				)}
				{view.pendingAccount && (
					<p className="text-[#92400E] text-xs">
						{view.pendingAccount.accountNumberMasked} —{" "}
						{isPayoutAccountStatus(view.pendingAccount.status)
							? t(PAYOUT_ACCOUNT_STATUSES[view.pendingAccount.status])
							: view.pendingAccount.status}
					</p>
				)}
				{cooldownActive && view.changeCooldownUntil ? (
					<p className="text-[#64748B] text-xs">
						{t("setup_cooldownUntil", {
							date: formatOrderDate(view.changeCooldownUntil, locale),
						})}
					</p>
				) : (
					step2Done &&
					!view.pendingAccount && (
						<PayoutAccountForm
							shopId={shopId}
							hasActiveAccount={Boolean(view.payoutAccount)}
							payoutChangeHoldHours={view.payoutChangeHoldHours}
						/>
					)
				)}
			</section>
		</div>
	);
}
