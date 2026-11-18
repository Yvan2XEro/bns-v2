"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useOrderMoney } from "~/hooks/use-order-money";
import { formatOrderDate } from "~/lib/order-money";
import { useLocaleKey } from "~/lib/use-locale-key";
import type { CommissionInvoiceView } from "~/types/order";
import { InvoiceStatusBadge, isPayable } from "./invoice-status";
import { PayInvoiceButton } from "./pay-invoice-button";

export function InvoiceList({
	shopId,
	invoices,
}: {
	shopId: string;
	invoices: CommissionInvoiceView[];
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Billing");
	const locale = useLocaleKey();

	if (invoices.length === 0) {
		return (
			<p className="rounded-2xl border border-line border-dashed bg-surface px-6 py-10 text-center text-ink-muted text-sm">
				{t("noInvoices")}
			</p>
		);
	}

	return (
		<ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
			{invoices.map((invoice) => (
				<li
					key={invoice.id}
					className="flex flex-wrap items-center justify-between gap-3 p-4"
				>
					<div className="min-w-0 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<Link
								href={`/seller/billing/${encodeURIComponent(invoice.id)}`}
								className="inline-flex min-h-11 items-center font-semibold text-[var(--shop-accent-text,var(--c-brand))] hover:underline"
							>
								{t("invoiceNumber", { number: invoice.invoiceNumber })}
							</Link>
							<InvoiceStatusBadge status={invoice.status} />
						</div>
						<p className="text-ink-muted text-xs">
							{t("periodRange", {
								start: formatOrderDate(invoice.periodStart, locale),
								end: formatOrderDate(invoice.periodEnd, locale),
							})}
							{" · "}
							{t("ordersCount", { count: invoice.ordersCount })}
						</p>
						<p className="text-ink-soft text-xs">
							{invoice.paidAt
								? t("paidAt", { date: formatOrderDate(invoice.paidAt, locale) })
								: t("dueAt", { date: formatOrderDate(invoice.dueAt, locale) })}
						</p>
					</div>
					<div className="flex items-center gap-4">
						<p className="font-bold text-ink">
							{formatOrderMoney(invoice.totalDue, locale)}
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
