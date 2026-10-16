"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadingRows } from "~/components/seller/load-states";
import { useBilling } from "~/hooks/use-billing";
import { useOrderMoney } from "~/hooks/use-order-money";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import { useLocaleKey } from "~/lib/use-locale-key";
import { InvoiceStatusBadge, isPayable } from "../billing/invoice-status";
import { PayInvoiceButton } from "../billing/pay-invoice-button";

const SHOWN = 4;

/**
 * The latest commission invoices on the payments page itself; the billing
 * page keeps the full list, the current-period detail and the restriction
 * banner.
 */
export function CommissionInvoicesCard({ shopId }: { shopId: string }) {
	const formatOrderMoney = useOrderMoney();
	const tBilling = useTranslations("Billing");
	const tPage = useTranslations("PaymentsPage");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const billing = useBilling(shopId);

	return (
		<section
			aria-labelledby="commission-invoices-title"
			className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
		>
			<div className="flex items-center justify-between gap-2 border-[#F1F5F9] border-b px-[18px] py-3.5">
				<h2
					id="commission-invoices-title"
					className="font-bold text-[#0F172A] text-base"
				>
					{tPage("invoicesTitle")}
				</h2>
				<Link
					href="/seller/billing"
					className="font-semibold text-[13px] text-[var(--shop-accent-text,#1E40AF)] hover:underline"
				>
					{tPage("allInvoices")}
				</Link>
			</div>
			{billing.isPending ? (
				<div className="p-[18px]">
					<LoadingRows rows={2} />
				</div>
			) : billing.isError ? (
				<p role="alert" className="px-[18px] py-4 text-[#64748B] text-sm">
					{tBilling("loadError")} — {resolveErrorMessage(billing.error, tRoot)}
				</p>
			) : (
				<>
					{billing.data.invoices.length === 0 ? (
						<p className="px-[18px] py-6 text-center text-[#64748B] text-sm">
							{tBilling("noInvoices")}
						</p>
					) : (
						<ul>
							{billing.data.invoices.slice(0, SHOWN).map((invoice) => (
								<li
									key={invoice.id}
									className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-[#F1F5F9] border-b px-[18px] py-[11px] sm:grid-cols-[minmax(0,1fr)_92px_84px_auto]"
								>
									<div className="flex min-w-0 items-center gap-2.5">
										<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#475569]">
											<FileText aria-hidden="true" className="h-4 w-4" />
										</span>
										<div className="min-w-0">
											<Link
												href={`/seller/billing/${encodeURIComponent(invoice.id)}`}
												className="font-semibold text-[#0F172A] hover:text-[var(--shop-accent-text,#1E40AF)] hover:underline"
											>
												{tBilling("periodRange", {
													start: formatOrderDate(invoice.periodStart, locale),
													end: formatOrderDate(invoice.periodEnd, locale),
												})}
											</Link>
											<p className="truncate text-[#64748B] text-xs">
												{invoice.invoiceNumber} ·{" "}
												{tBilling("ordersCount", {
													count: invoice.ordersCount,
												})}
											</p>
										</div>
									</div>
									<div className="hidden text-right sm:block">
										<p className="text-[#334155] text-[13px] tabular-nums">
											{formatOrderMoney(invoice.commissionTotal, locale)}
										</p>
										<p className="text-[#94A3B8] text-[11px]">
											{tPage("excludingTax")}
										</p>
									</div>
									<div className="hidden text-right sm:block">
										<p className="text-[#334155] text-[13px] tabular-nums">
											{formatOrderMoney(invoice.vatAmount, locale)}
										</p>
										<p className="text-[#94A3B8] text-[11px]">
											{tBilling("vat")}
										</p>
									</div>
									<div className="flex flex-col items-end gap-1">
										<span className="font-bold text-[#0F172A] text-sm tabular-nums">
											{formatOrderMoney(invoice.totalDue, locale)}
										</span>
										<InvoiceStatusBadge status={invoice.status} />
									</div>
									{isPayable(invoice.status) && (
										<div className="col-span-full flex justify-end">
											<PayInvoiceButton
												shopId={shopId}
												invoiceId={invoice.id}
											/>
										</div>
									)}
								</li>
							))}
						</ul>
					)}
					<div className="space-y-2 bg-[#F8FAFC] px-[18px] py-3">
						<div className="flex justify-between gap-3 text-sm">
							<span className="text-[#64748B]">
								{tPage("currentPeriod", {
									start: formatOrderDate(
										billing.data.currentPeriod.periodStart,
										locale,
									),
									end: formatOrderDate(
										billing.data.currentPeriod.periodEnd,
										locale,
									),
								})}
							</span>
							<span className="font-semibold text-[#0F172A] tabular-nums">
								{formatOrderMoney(billing.data.currentPeriod.accrued, locale)}
							</span>
						</div>
						<p className="text-[#64748B] text-xs leading-[17px]">
							{tPage("invoicesExplainer")}
						</p>
					</div>
				</>
			)}
		</section>
	);
}
