"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
import type { CommissionInvoiceView } from "~/types/order";
import { InvoiceStatusBadge, isPayable } from "./invoice-status";
import { PayInvoiceButton } from "./pay-invoice-button";
import { useLocaleKey } from "./use-locale-key";

export function InvoiceList({
	shopId,
	invoices,
}: {
	shopId: string;
	invoices: CommissionInvoiceView[];
}) {
	const t = useTranslations("Billing");
	const locale = useLocaleKey();

	if (invoices.length === 0) {
		return (
			<p className="rounded-2xl border border-[#E2E8F0] border-dashed bg-white px-6 py-10 text-center text-[#64748B] text-sm">
				{t("noInvoices")}
			</p>
		);
	}

	return (
		<ul className="divide-y divide-[#E2E8F0] rounded-2xl border border-[#E2E8F0] bg-white">
			{invoices.map((invoice) => (
				<li
					key={invoice.id}
					className="flex flex-wrap items-center justify-between gap-3 p-4"
				>
					<div className="min-w-0 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<Link
								href={`/seller/billing/${encodeURIComponent(invoice.id)}`}
								className="inline-flex min-h-11 items-center font-semibold text-[#1E40AF] hover:underline"
							>
								{t("invoiceNumber", { number: invoice.invoiceNumber })}
							</Link>
							<InvoiceStatusBadge status={invoice.status} />
						</div>
						<p className="text-[#64748B] text-xs">
							{t("periodRange", {
								start: formatOrderDate(invoice.periodStart, locale),
								end: formatOrderDate(invoice.periodEnd, locale),
							})}
							{" · "}
							{t("ordersCount", { count: invoice.ordersCount })}
						</p>
						<p className="text-[#334155] text-xs">
							{invoice.paidAt
								? t("paidAt", { date: formatOrderDate(invoice.paidAt, locale) })
								: t("dueAt", { date: formatOrderDate(invoice.dueAt, locale) })}
						</p>
					</div>
					<div className="flex items-center gap-4">
						<p className="font-bold text-[#0F172A]">
							{formatXaf(invoice.totalDue, locale)}
						</p>
						{isPayable(invoice.status) && (
							<PayInvoiceButton shopId={shopId} invoiceId={invoice.id} />
						)}
					</div>
				</li>
			))}
		</ul>
	);
}
