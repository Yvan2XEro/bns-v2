import type { BillingView, CommissionInvoiceView } from "../types/order";
import { ERROR_CODES } from "./apiError";

export type InvoiceStatus = CommissionInvoiceView["status"];

export const INVOICE_STATUS_KEYS: Record<InvoiceStatus, string> = {
	issued: "billing.statusIssued",
	paid: "billing.statusPaid",
	overdue: "billing.statusOverdue",
	waived: "billing.statusWaived",
	void: "billing.statusVoid",
};

/**
 * The two states `payInvoice` opens a payment for. The server refuses the
 * rest anyway — `commission.alreadyPaid` for `paid`, `commission.notPayable`
 * for a `waived` or `void` debt — so this only keeps a dead button off screen.
 */
export function isPayable(status: InvoiceStatus): boolean {
	return status === "issued" || status === "overdue";
}

/**
 * A pay refusal that means the invoice moved under the screen (paid elsewhere,
 * written off, gone): the list is stale and must be re-read, not retried.
 */
const STALE_INVOICE_CODES: readonly string[] = [
	ERROR_CODES.commissionNotPayable,
	ERROR_CODES.commissionAlreadyPaid,
	ERROR_CODES.commissionInvoiceNotFound,
];

export function isStaleInvoiceError(error: unknown): boolean {
	if (!error || typeof error !== "object" || !("code" in error)) return false;
	return STALE_INVOICE_CODES.includes(String(error.code));
}

/** What lifts the restriction depends on who set it; the banner says which. */
export function restrictionClearKey(
	reason: NonNullable<BillingView["restricted"]>["reason"],
): string {
	return reason === "staff"
		? "billing.restrictedClearStaff"
		: "billing.restrictedClearOverdue";
}

export function findInvoice(
	view: BillingView,
	invoiceId: string | undefined,
): CommissionInvoiceView | null {
	return view.invoices.find((invoice) => invoice.id === invoiceId) ?? null;
}

export const INVOICE_LINE_KIND_KEYS: Record<
	CommissionInvoiceView["lines"][number]["kind"],
	string
> = {
	charge: "billing.lineCharge",
	credit: "billing.lineCredit",
	carry_over: "billing.lineCarryOver",
};
