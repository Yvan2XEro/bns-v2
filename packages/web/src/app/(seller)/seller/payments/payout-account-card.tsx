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
			className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white px-[18px] py-4"
		>
			<div className="flex items-center justify-between gap-2">
				<h2
					id="payout-account-title"
					className="font-bold text-[#0F172A] text-base"
				>
					{tPayments("seller_statusPayoutAccount")}
				</h2>
				<Link
					href="/seller/payments/setup"
					className="font-semibold text-[#1E40AF] text-[13px] hover:underline"
				>
					{account ? tPage("edit") : tPage("setUp")}
				</Link>
			</div>
			{setup.isPending ? (
				<div className="h-16 animate-pulse rounded-xl bg-[#F1F5F9]" />
			) : setup.isError ? (
				<p role="alert" className="text-[#64748B] text-sm">
					{resolveErrorMessage(setup.error, tRoot)}
				</p>
			) : !account ? (
				<p className="text-[#64748B] text-sm">
					{tPayments("seller_payoutAccountNotSet")}
				</p>
			) : (
				<>
					<div className="flex items-center gap-3 rounded-[10px] border border-[#E2E8F0] p-3">
						<div className="min-w-0 flex-1">
							<p className="font-semibold text-[#0F172A]">
								{tPayments(PAYOUT_METHODS[account.method])}
							</p>
							<p className="text-[#64748B] text-[13px] tabular-nums">
								{account.accountNumberMasked}
							</p>
						</div>
						<span
							className={`rounded-full px-2.5 py-0.5 font-semibold text-xs ${account.status === "active" ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#FEF3C7] text-[#92400E]"}`}
						>
							{tPayments(PAYOUT_ACCOUNT_STATUSES[account.status])}
						</span>
					</div>
					<div className="flex justify-between gap-3 text-sm">
						<span className="text-[#64748B]">{tPage("holderName")}</span>
						<span className="font-semibold text-[#0F172A]">
							{account.accountName}
						</span>
					</div>
					{account.identityName && (
						<div className="flex justify-between gap-3 text-sm">
							<span className="text-[#64748B]">
								{tPage("verifiedIdentityName")}
							</span>
							<span className="text-right font-semibold text-[#0F172A]">
								{account.identityName}
							</span>
						</div>
					)}
					{account.nameMatch && (
						<p
							className={`flex items-start gap-1.5 font-semibold text-[13px] ${account.nameMatch === "match" ? "text-[#15803D]" : "text-[#B45309]"}`}
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
				<p className="flex gap-2 rounded-[10px] bg-[#FFFBEB] p-3 text-[#92400E] text-xs leading-[17px]">
					<Lock aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
					{tPayments("setup_changeNotice", {
						hours: setup.data.payoutChangeHoldHours,
					})}
				</p>
			)}
		</section>
	);
}
