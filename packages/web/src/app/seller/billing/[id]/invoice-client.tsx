"use client";

import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { invoiceDocumentUrl, useBilling } from "~/hooks/use-billing";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
import { InvoiceStatusBadge, isPayable } from "../invoice-status";
import { PayInvoiceButton } from "../pay-invoice-button";
import { useLocaleKey } from "../use-locale-key";

/**
 * The summary comes from the billing view; the invoice itself is the API's
 * own HTML document, framed same-origin (the `/api` rewrite) so the session
 * cookie goes with it. The client renders no line of the invoice itself.
 */
export function InvoiceClient({
	shopId,
	invoiceId,
}: {
	shopId: string;
	invoiceId: string;
}) {
	const t = useTranslations("Billing");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const billing = useBilling(shopId);

	const back = (
		<Link
			href="/seller/billing"
			className="inline-flex min-h-11 items-center gap-1.5 text-[#1E40AF] text-sm hover:underline"
		>
			<ArrowLeft aria-hidden="true" className="h-4 w-4" />
			{t("backToBilling")}
		</Link>
	);

	if (billing.isPending) return <LoadingRows rows={3} />;
	if (billing.isError) {
		return (
			<LoadError
				title={`${t("loadError")} — ${resolveErrorMessage(billing.error, tRoot)}`}
				onRetry={() => void billing.refetch()}
			/>
		);
	}

	const invoice = billing.data.invoices.find((entry) => entry.id === invoiceId);
	if (!invoice) {
		return (
			<div className="space-y-4">
				{back}
				<p
					role="alert"
					className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center text-[#64748B] text-sm"
				>
					{t("invoiceNotFound")}
				</p>
			</div>
		);
	}

	const documentUrl = invoiceDocumentUrl(invoice.id, locale);

	return (
		<div className="space-y-5">
			{back}
			<header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<div className="space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-bold text-[#0F172A] text-xl">
							{t("invoiceNumber", { number: invoice.invoiceNumber })}
						</h1>
						<InvoiceStatusBadge status={invoice.status} />
					</div>
					<p className="text-[#64748B] text-sm">
						{t("periodRange", {
							start: formatOrderDate(invoice.periodStart, locale),
							end: formatOrderDate(invoice.periodEnd, locale),
						})}
					</p>
					<p className="text-[#334155] text-sm">
						{invoice.paidAt
							? t("paidAt", { date: formatOrderDate(invoice.paidAt, locale) })
							: t("dueAt", { date: formatOrderDate(invoice.dueAt, locale) })}
					</p>
				</div>
				<div className="flex flex-col items-end gap-2">
					<p className="text-[#64748B] text-xs">{t("totalDue")}</p>
					<p className="font-bold text-2xl text-[#0F172A]">
						{formatXaf(invoice.totalDue, locale)}
					</p>
					{isPayable(invoice.status) && (
						<PayInvoiceButton shopId={shopId} invoiceId={invoice.id} />
					)}
				</div>
			</header>

			<section aria-labelledby="invoice-document-title" className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2
						id="invoice-document-title"
						className="font-semibold text-[#0F172A]"
					>
						{t("document")}
					</h2>
					<a
						href={documentUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex min-h-11 items-center gap-1.5 text-[#1E40AF] text-sm hover:underline"
					>
						{t("openDocument")}
						<ExternalLink aria-hidden="true" className="h-4 w-4" />
					</a>
				</div>
				<iframe
					src={documentUrl}
					title={t("invoiceNumber", { number: invoice.invoiceNumber })}
					sandbox=""
					className="h-[70vh] w-full rounded-2xl border border-[#E2E8F0] bg-white"
				/>
			</section>
		</div>
	);
}
