"use client";

import { CircleAlert, CircleCheck, Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePaymentSetup } from "~/hooks/use-seller-payments";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	NAME_MATCH_RESULTS,
	PAYOUT_ACCOUNT_STATUSES,
	PAYOUT_METHODS,
} from "~/lib/payment-status";

/**
 * Read-only summary of the active payout account; every change still goes
 * through the setup page, which owns the cooldown and the "not me" flow.
 */
export function PayoutAccountCard({ shopId }: { shopId: string }) {
	const tPayments = useTranslations("Payments");
	const tPage = useTranslations("PaymentsPage");
	const tRoot = useTranslations();
	const setup = usePaymentSetup(shopId);
	const account = setup.data?.payoutAccount ?? null;

	return (
		<section
			aria-labelledby="payout-account-title"
			className="space-y-3 rounded-2xl border border-line bg-surface px-[18px] py-4"
		>
			<div className="flex items-center justify-between gap-2">
				<h2 id="payout-account-title" className="font-bold text-base text-ink">
					{tPayments("seller_statusPayoutAccount")}
				</h2>
				<Link
					href="/seller/payments/setup"
					className="font-semibold text-[13px] text-[var(--shop-accent-text,var(--c-brand))] hover:underline"
				>
					{account ? tPage("edit") : tPage("setUp")}
				</Link>
			</div>
			{setup.isPending ? (
				<div className="h-16 animate-pulse rounded-xl bg-subtle" />
			) : setup.isError ? (
				<p role="alert" className="text-ink-muted text-sm">
					{resolveErrorMessage(setup.error, tRoot)}
				</p>
			) : !account ? (
				<p className="text-ink-muted text-sm">
					{tPayments("seller_payoutAccountNotSet")}
				</p>
			) : (
				<>
					<div className="flex items-center gap-3 rounded-[10px] border border-line p-3">
						<div className="min-w-0 flex-1">
							<p className="font-semibold text-ink">
								{tPayments(PAYOUT_METHODS[account.method])}
							</p>
							<p className="text-[13px] text-ink-muted tabular-nums">
								{account.accountNumberMasked}
							</p>
						</div>
						<span
							className={`rounded-full px-2.5 py-0.5 font-semibold text-xs ${account.status === "active" ? "bg-ok-soft text-ok-ink" : "bg-warn-soft text-warn-ink"}`}
						>
							{tPayments(PAYOUT_ACCOUNT_STATUSES[account.status])}
						</span>
					</div>
					<div className="flex justify-between gap-3 text-sm">
						<span className="text-ink-muted">{tPage("holderName")}</span>
						<span className="font-semibold text-ink">
							{account.accountName}
						</span>
					</div>
					{account.identityName && (
						<div className="flex justify-between gap-3 text-sm">
							<span className="text-ink-muted">
								{tPage("verifiedIdentityName")}
							</span>
							<span className="text-right font-semibold text-ink">
								{account.identityName}
							</span>
						</div>
					)}
					{account.nameMatch && (
						<p
							className={`flex items-start gap-1.5 font-semibold text-[13px] ${account.nameMatch === "match" ? "text-ok-ink-soft" : "text-warn-ink-soft"}`}
						>
							{account.nameMatch === "match" ? (
								<CircleCheck
									aria-hidden="true"
									className="mt-px h-4 w-4 shrink-0"
								/>
							) : (
								<CircleAlert
									aria-hidden="true"
									className="mt-px h-4 w-4 shrink-0"
								/>
							)}
							{tPayments(NAME_MATCH_RESULTS[account.nameMatch])}
						</p>
					)}
				</>
			)}
			{setup.data && (
				<p className="flex gap-2 rounded-[10px] bg-warn-faint p-3 text-warn-ink text-xs leading-[17px]">
					<Lock aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
					{tPayments("setup_changeNotice", {
						hours: setup.data.payoutChangeHoldHours,
					})}
				</p>
			)}
		</section>
	);
}
