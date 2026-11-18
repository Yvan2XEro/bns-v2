"use client";

import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { CommissionInvoiceView } from "~/types/order";

type InvoiceStatus = CommissionInvoiceView["status"];

const TONE: Record<InvoiceStatus, string> = {
	issued:
		"bg-[var(--shop-accent-soft,var(--c-brand-soft))] text-[var(--shop-accent-text,var(--c-brand))]",
	paid: "bg-ok-faint text-ok-ink",
	overdue: "bg-bad-faint text-bad-ink-soft",
	waived: "bg-subtle text-ink-mid",
	void: "bg-subtle text-ink-mid",
};

/** The two states `payInvoice` would open a payment for. */
export function isPayable(status: InvoiceStatus): boolean {
	return status === "issued" || status === "overdue";
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
	const t = useTranslations("Billing");
	const labels: Record<InvoiceStatus, string> = {
		issued: t("statusIssued"),
		paid: t("statusPaid"),
		overdue: t("statusOverdue"),
		waived: t("statusWaived"),
		void: t("statusVoid"),
	};
	return (
		<span
			className={cn(
				"inline-flex rounded-full px-2.5 py-0.5 font-semibold text-xs",
				TONE[status],
			)}
		>
			{labels[status]}
		</span>
	);
}
