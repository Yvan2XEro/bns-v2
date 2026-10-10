"use client";

import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { CommissionInvoiceView } from "~/types/order";

type InvoiceStatus = CommissionInvoiceView["status"];

const TONE: Record<InvoiceStatus, string> = {
	issued: "bg-[#EFF6FF] text-[#1E40AF]",
	paid: "bg-[#F0FDF4] text-[#166534]",
	overdue: "bg-[#FEF2F2] text-[#B91C1C]",
	waived: "bg-[#F1F5F9] text-[#475569]",
	void: "bg-[#F1F5F9] text-[#475569]",
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
